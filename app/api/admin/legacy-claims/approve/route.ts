import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validPoints(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export async function POST(request: NextRequest) {
  try {
    // 1. 驗證登入
    const header = request.headers.get("authorization");

    if (!header?.startsWith("Bearer ")) {
      return apiError("請先登入管理員帳號。", 401);
    }

    const decoded = await adminAuth.verifyIdToken(
      header.slice(7)
    );

    // 2. 確認管理員身分
    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (
      !adminSnapshot.exists ||
      adminSnapshot.data()?.role !== "admin"
    ) {
      return apiError("只有管理員可以核准認領申請。", 403);
    }

    // 3. 取得申請編號及舊會員編號
    const body = await request.json();

    const requestId = String(body.requestId ?? "").trim();
    const legacyMemberId = String(
      body.legacyMemberId ?? ""
    ).trim();
const identityVerificationMethod = String(
  body.identityVerificationMethod ?? ""
).trim();

if (
  identityVerificationMethod.length < 10 ||
  identityVerificationMethod.length > 500
) {
  return apiError(
    "請填寫完整的舊會員身分確認方式（10～500 字）。",
    400
  );
}
    if (
      !requestId ||
      !legacyMemberId ||
      requestId.includes("/") ||
      legacyMemberId.includes("/")
    ) {
      return apiError("申請編號或舊會員編號不正確。", 400);
    }
// 申請編號即會員 UID，先確認 Email 已驗證
let claimantAuth;

try {
  claimantAuth = await adminAuth.getUser(requestId);
} catch {
  return apiError("找不到申請會員的登入帳號。", 404);
}

if (!claimantAuth.emailVerified) {
  return apiError(
    "此會員尚未完成 Email 驗證，不能核准認領。",
    409
  );
}
    const claimRef = adminDb
      .collection("legacyClaimRequests")
      .doc(requestId);

    const legacyRef = adminDb
      .collection("legacyMembers")
      .doc(legacyMemberId);

    // 管理員核准前，從 Firebase Auth 重新確認申請人的 Email 驗證狀態。
    const pendingClaim = await claimRef.get();
    if (!pendingClaim.exists) return apiError("找不到認領申請。", 404);
    const applicantUid = String(pendingClaim.data()?.uid ?? "");
    if (!applicantUid || applicantUid !== requestId) {
      return apiError("認領申請資料異常。", 400);
    }
    const applicantAuth = await adminAuth.getUser(applicantUid);
    if (!applicantAuth.emailVerified) {
      return apiError("會員尚未完成 Email 驗證，不能核准認領。", 409);
    }

    // 4. Transaction：所有檢查與移轉一次完成
    const result = await adminDb.runTransaction(async (tx) => {
      const claimSnapshot = await tx.get(claimRef);
      const legacySnapshot = await tx.get(legacyRef);

      if (!claimSnapshot.exists) {
        throw new Error("CLAIM_NOT_FOUND");
      }

      if (!legacySnapshot.exists) {
        throw new Error("LEGACY_NOT_FOUND");
      }

      const claim = claimSnapshot.data() ?? {};
      const legacy = legacySnapshot.data() ?? {};

      if (claim.status !== "pending") {
        throw new Error("ALREADY_REVIEWED");
      }

      // 申請 ID 必須與登入會員 UID 相同
      const uid = String(claim.uid ?? "");

      if (
        !uid ||
        uid !== requestId ||
        uid.includes("/")
      ) {
        throw new Error("INVALID_CLAIM");
      }

      // 已認領資料一律禁止再次移轉
      if (
        legacy.status !== "unclaimed" ||
        legacy.claimedBy ||
        legacy.claimedAt
      ) {
        throw new Error("LEGACY_CLAIMED");
      }

      // 5. 比對手機與生日
      const claimPhone = normalizePhone(claim.phone);
      const legacyPhone = normalizePhone(
        legacy.phoneNormalized ?? legacy.phone
      );

      if (
        !claimPhone ||
        claimPhone !== legacyPhone
      ) {
        throw new Error("IDENTITY_MISMATCH");
      }

      const claimYear = Number(claim.birthdayYear ?? 0);
      const legacyYear = Number(legacy.birthdayYear ?? 0);

      if (
        Number(claim.birthdayMonth) !==
          Number(legacy.birthdayMonth) ||
        Number(claim.birthdayDay) !==
          Number(legacy.birthdayDay) ||
        claimYear !== legacyYear
      ) {
        throw new Error("IDENTITY_MISMATCH");
      }

      // 6. 讀取會員帳號
      const userRef = adminDb.collection("users").doc(uid);
      const userSnapshot = await tx.get(userRef);

      if (!userSnapshot.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      const user = userSnapshot.data() ?? {};

      if (
        user.legacyMemberId ||
        user.legacyClaimedAt
      ) {
        throw new Error("USER_ALREADY_CLAIMED");
      }

      // 7. 驗證點數
      const legacyPoints = legacy.points ?? 0;
      const legacyRewards = legacy.rewardPoints ?? 0;
      const currentPoints = user.points ?? 0;
      const currentRewards = user.rewardPoints ?? 0;

      // 舊系統已完成的上課堂數，僅在首次認領時移轉。
      const legacyClasses = legacy.journeyLegacyClasses ?? 0;
      const currentClasses = user.journeyLegacyClasses ?? 0;

      if (
        !Number.isSafeInteger(legacyClasses) ||
        legacyClasses < 0 ||
        legacyClasses > 100000 ||
        !Number.isSafeInteger(currentClasses) ||
        currentClasses < 0 ||
        currentClasses > 100000
      ) {
        throw new Error("INVALID_LEGACY_CLASSES");
      }

      // 不覆蓋會員帳號原有的歷史上課紀錄。
      if (currentClasses !== 0) {
        throw new Error("LEGACY_CLASSES_CONFLICT");
      }

      if (
        !validPoints(legacyPoints) ||
        !validPoints(legacyRewards) ||
        !validPoints(currentPoints) ||
        !validPoints(currentRewards)
      ) {
        throw new Error("INVALID_POINTS");
      }

      const newPoints = currentPoints + legacyPoints;
      const newRewards = currentRewards + legacyRewards;

      if (
        !Number.isSafeInteger(newPoints) ||
        !Number.isSafeInteger(newRewards)
      ) {
        throw new Error("INVALID_POINTS");
      }

      // 8. 預先建立固定 ID 的交易紀錄
      // 避免同一筆申請產生重複紀錄
      const pointTransactionRef = adminDb
        .collection("pointTransactions")
        .doc(`legacy_claim_${requestId}`);

      const rewardTransactionRef = adminDb
        .collection("rewardTransactions")
        .doc(`legacy_claim_${requestId}`);

      const pointTransactionSnapshot = await tx.get(
        pointTransactionRef
      );

      const rewardTransactionSnapshot = await tx.get(
        rewardTransactionRef
      );

      if (
        pointTransactionSnapshot.exists ||
        rewardTransactionSnapshot.exists
      ) {
        throw new Error("DUPLICATE_TRANSACTION");
      }

      // 9. 所有讀取完成後，才開始寫入
      tx.update(userRef, {
        points: newPoints,
        rewardPoints: newRewards,
        journeyLegacyClasses: legacyClasses,
        legacyMemberId,
        legacyClaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(legacyRef, {
        status: "claimed",
        claimedBy: uid,
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

     tx.update(claimRef, {
  status: "approved",
  legacyMemberId,
  pointsTransferred: legacyPoints,
  rewardPointsTransferred: legacyRewards,
  identityVerificationMethod,
  reviewedBy: decoded.uid,
  reviewedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

      tx.create(pointTransactionRef, {
  userId: uid,
  adminId: decoded.uid,
  type: "legacy_claim",
  amount: legacyPoints,
  note: "舊會員認領－課程點數移轉",
  balanceAfter: newPoints,
  legacyMemberId,
  claimRequestId: requestId,
  createdAt: FieldValue.serverTimestamp(),
});

      tx.create(rewardTransactionRef, {
  userId: uid,
  adminId: decoded.uid,
  type: "legacy_claim",
  amount: legacyRewards,
  note: "舊會員認領－紅利點數移轉",
  balanceAfter: newRewards,
  legacyMemberId,
  claimRequestId: requestId,
  createdAt: FieldValue.serverTimestamp(),
});

      return {
        pointsTransferred: legacyPoints,
        rewardPointsTransferred: legacyRewards,
        newPointBalance: newPoints,
        newRewardBalance: newRewards,
      };
    });

    return NextResponse.json({
      success: true,
      message: "舊會員認領已核准，點數移轉完成。",
      ...result,
    });
  } catch (error) {
    console.error("核准舊會員認領失敗：", error);

    const code =
      error instanceof Error ? error.message : "";

    const errors: Record<string, [string, number]> = {
      CLAIM_NOT_FOUND: ["找不到認領申請。", 404],
      LEGACY_NOT_FOUND: ["找不到舊會員資料。", 404],
      ALREADY_REVIEWED: ["此申請已審核。", 409],
      INVALID_CLAIM: ["認領申請資料異常。", 400],
      LEGACY_CLAIMED: ["此舊會員已完成認領。", 409],
      IDENTITY_MISMATCH: ["手機或生日與舊會員資料不符。", 409],
      USER_NOT_FOUND: ["找不到申請會員帳號。", 404],
      USER_ALREADY_CLAIMED: ["此帳號已完成舊會員認領。", 409],
      INVALID_POINTS: ["會員點數資料異常，請人工確認。", 409],
      INVALID_LEGACY_CLASSES: ["歷史上課堂數資料異常，請人工確認。", 409],
      LEGACY_CLASSES_CONFLICT: ["此會員已有歷史上課紀錄，請確認後再核准，避免重複移轉。", 409],
      DUPLICATE_TRANSACTION: ["已存在移轉紀錄，禁止重複加點。", 409],
    };

    const matched = errors[code];

    return apiError(
      matched?.[0] ?? "核准認領失敗，請稍後再試。",
      matched?.[1] ?? 500
    );
  }
}

