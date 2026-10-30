import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { prepareLegacyCouponTransfer } from "@/lib/legacyCouponTransfer";

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
  // 尚未正式開放，只允許本機測試環境。
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== "true" ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-naya-aerial" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
  ) {
    return apiError("舊會員自動認領功能尚未開放。", 503);
  }

  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return apiError("請先登入會員帳號。", 401);
    }

    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7),
      true
    );

    // 必須由 Firebase Auth 確認 Email 已驗證。
    const account = await adminAuth.getUser(decoded.uid);

    if (!account.emailVerified) {
      return apiError("請先完成 Email 驗證。", 403);
    }

    const uid = decoded.uid;
    const userRef = adminDb.collection("users").doc(uid);
    const claimRef = adminDb.collection("legacyClaimRequests").doc(uid);

    // 先查詢認領申請，以取得手機與完整生日。
    const claimSnapshot = await claimRef.get();

    if (!claimSnapshot.exists) {
      return apiError("找不到舊會員認領資料，請聯繫老師。", 404);
    }

    const claim = claimSnapshot.data() ?? {};

    if (claim.uid !== uid) {
      return apiError("認領資料與登入帳號不符。", 403);
    }

    if (claim.status === "approved") {
      const userSnapshot = await userRef.get();
      const user = userSnapshot.data() ?? {};

      if (
        user.legacyMemberId &&
        user.legacyMemberId === claim.legacyMemberId
      ) {
        return NextResponse.json({
          success: true,
          status: "approved",
          alreadyCompleted: true,
          message: "舊會員點數已完成移轉。",
        });
      }

      return apiError("認領紀錄異常，請聯繫老師。", 409);
    }

    if (claim.status !== "pending") {
      return apiError("認領申請狀態不允許自動移轉。", 409);
    }

    const phone = normalizePhone(claim.phone);
    const year = Number(claim.birthdayYear);
    const month = Number(claim.birthdayMonth);
    const day = Number(claim.birthdayDay);

    if (
      !/^09\d{8}$/.test(phone) ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date().getFullYear() ||
      !Number.isInteger(month) ||
      !Number.isInteger(day)
    ) {
      return apiError("認領資料格式異常。", 409);
    }

    const birthday = new Date(year, month - 1, day);

    if (
      birthday.getFullYear() !== year ||
      birthday.getMonth() !== month - 1 ||
      birthday.getDate() !== day
    ) {
      return apiError("認領生日資料異常。", 409);
    }

    // 不由前端指定舊會員 ID。
    const legacyMatches = await adminDb
      .collection("legacyMembers")
      .where("phoneNormalized", "==", phone)
      .get();

    if (legacyMatches.size !== 1) {
      return apiError("舊會員資料無法確認，請聯繫老師。", 409);
    }

    const legacyRef = legacyMatches.docs[0].ref;
    const phoneRegistryRef = adminDb
      .collection("phoneRegistry")
      .doc(phone);

    const result = await adminDb.runTransaction(async (tx) => {
      // Transaction 內重新讀取，防止同時認領。
      const claimDoc = await tx.get(claimRef);
      const legacyDoc = await tx.get(legacyRef);
      const userDoc = await tx.get(userRef);
      const phoneRegistryDoc = await tx.get(phoneRegistryRef);

      if (!claimDoc.exists || !legacyDoc.exists || !userDoc.exists) {
        throw new Error("MISSING_DATA");
      }

      const latestClaim = claimDoc.data() ?? {};
      const legacy = legacyDoc.data() ?? {};
      const user = userDoc.data() ?? {};

      // 確認手機仍綁定目前登入會員，且未被其他手機取代。
      const phoneRegistry = phoneRegistryDoc.data();

      if (
        !phoneRegistryDoc.exists ||
        phoneRegistry?.userId !== uid ||
        phoneRegistry?.phone !== phone ||
        phoneRegistry?.status === "replaced"
      ) {
        throw new Error("PHONE_REGISTRY_MISMATCH");
      }

      // 重複呼叫只回傳已完成，不再加點。
      if (latestClaim.status === "approved") {
        if (
          user.legacyMemberId === legacyRef.id &&
          legacy.claimedBy === uid &&
          legacy.status === "claimed"
        ) {
          return {
            alreadyCompleted: true,
            pointsTransferred: 0,
            rewardPointsTransferred: 0,
          };
        }

        throw new Error("CLAIM_CONFLICT");
      }

      if (
        latestClaim.status !== "pending" ||
        latestClaim.uid !== uid
      ) {
        throw new Error("CLAIM_CONFLICT");
      }

      if (
        user.legacyMemberId ||
        user.legacyClaimedAt ||
        legacy.status !== "unclaimed" ||
        legacy.claimedBy ||
        legacy.claimedAt
      ) {
        throw new Error("ALREADY_CLAIMED");
      }

      // 重新比對認領申請與會員資料。
      const claimPhone = normalizePhone(latestClaim.phone);
      const userPhone = normalizePhone(
        user.phoneNormalized ?? user.phone
      );
      const legacyPhone = normalizePhone(
        legacy.phoneNormalized ?? legacy.phone
      );

      if (
        claimPhone !== phone ||
        userPhone !== phone ||
        legacyPhone !== phone ||
        Number(latestClaim.birthdayYear) !== year ||
        Number(latestClaim.birthdayMonth) !== month ||
        Number(latestClaim.birthdayDay) !== day ||
        Number(user.birthdayMonth) !== month ||
        Number(user.birthdayDay) !== day ||
        Number(legacy.birthdayYear) !== year ||
        Number(legacy.birthdayMonth) !== month ||
        Number(legacy.birthdayDay) !== day
      ) {
        throw new Error("IDENTITY_MISMATCH");
      }

      const legacyPoints = legacy.points ?? 0;
      const legacyRewards = legacy.rewardPoints ?? 0;
      const currentPoints = user.points ?? 0;
      const currentRewards = user.rewardPoints ?? 0;

      // 舊系統完成課程堂數：只在首次認領時移轉。
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

      // 已有歷史堂數時不自動覆蓋，避免重複計算。
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

      const pointRef = adminDb
        .collection("pointTransactions")
        .doc(`legacy_claim_${uid}`);

      const rewardRef = adminDb
        .collection("rewardTransactions")
        .doc(`legacy_claim_${uid}`);

      const pointDoc = await tx.get(pointRef);
      const rewardDoc = await tx.get(rewardRef);

      if (pointDoc.exists || rewardDoc.exists) {
        throw new Error("DUPLICATE_TRANSACTION");
      }

      // 認領優惠券：所有讀取完成後才寫入。
      const couponTransfer = await prepareLegacyCouponTransfer(
        tx,
        adminDb,
        uid,
        legacyRef.id,
        legacy.coupons
      );
      // 所有檢查完成後才開始寫入。
      couponTransfer.write();

      tx.update(userRef, {
        points: newPoints,
        rewardPoints: newRewards,
        journeyLegacyClasses: legacyClasses,
        legacyMemberId: legacyRef.id,
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
        legacyMemberId: legacyRef.id,
        pointsTransferred: legacyPoints,
        rewardPointsTransferred: legacyRewards,
        approvedBy: "system",
        reviewedBy: "system",
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.create(pointRef, {
        userId: uid,
        adminId: "system",
        type: "legacy_claim",
        amount: legacyPoints,
        note: "舊會員自動認領－課程點數移轉",
        balanceAfter: newPoints,
        legacyMemberId: legacyRef.id,
        claimRequestId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.create(rewardRef, {
        userId: uid,
        adminId: "system",
        type: "legacy_claim",
        amount: legacyRewards,
        note: "舊會員自動認領－紅利點數移轉",
        balanceAfter: newRewards,
        legacyMemberId: legacyRef.id,
        claimRequestId: uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        alreadyCompleted: false,
        pointsTransferred: legacyPoints,
        rewardPointsTransferred: legacyRewards,
        newPointBalance: newPoints,
        newRewardBalance: newRewards,
      };
    });

    return NextResponse.json({
      success: true,
      status: "approved",
      message: result.alreadyCompleted
        ? "舊會員點數已完成移轉。"
        : "舊會員認領成功，點數已自動移轉。",
      ...result,
    });
  } catch (error) {
    console.error("舊會員自動認領失敗：", error);

    const code = error instanceof Error ? error.message : "";

    const knownErrors: Record<string, string> = {
      MISSING_DATA: "找不到完整的會員認領資料。",
      CLAIM_CONFLICT: "認領申請狀態異常，請聯繫老師。",
      ALREADY_CLAIMED: "此舊會員已完成認領，無法重複移轉。",
      IDENTITY_MISMATCH: "會員資料比對失敗，請聯繫老師。",
      PHONE_REGISTRY_MISMATCH: "手機綁定資料不一致，請聯繫老師。",
      INVALID_POINTS: "點數資料異常，請聯繫老師。",
      INVALID_LEGACY_CLASSES: "舊會員上課紀錄異常，請聯繫老師。",
      LEGACY_CLASSES_CONFLICT: "帳號已有歷史上課紀錄，請聯繫老師確認，避免重複移轉。",
      DUPLICATE_TRANSACTION: "已有點數移轉紀錄，禁止重複加點。",
    };

    if (knownErrors[code]) {
      return apiError(knownErrors[code], 409);
    }

    return apiError("自動認領失敗，請稍後再試。", 500);
  }
}