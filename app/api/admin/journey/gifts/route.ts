
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const MILESTONES = [100, 300, 500] as const;

type MilestoneLevel = (typeof MILESTONES)[number];

type GiftStatus =
  | "not_claimed"
  | "notified"
  | "claimed";

type GiftRecord = {
  userId: string;
  milestoneClasses: MilestoneLevel;
  status: GiftStatus;
  claimedAt: string | null;
  updatedAt?: unknown;
  updatedBy?: string;
};

function isMilestoneLevel(
  value: unknown
): value is MilestoneLevel {
  return (
    typeof value === "number" &&
    MILESTONES.some((level) => level === value)
  );
}

function isGiftStatus(
  value: unknown
): value is GiftStatus {
  return (
    value === "not_claimed" ||
    value === "notified" ||
    value === "claimed"
  );
}

async function getAdminUserId(
  request: NextRequest
): Promise<string | null> {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    const snapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (
      !snapshot.exists ||
      snapshot.data()?.role !== "admin"
    ) {
      return null;
    }

    return decoded.uid;
  } catch {
    return null;
  }
}

async function getCompletedClasses(userId: string) {
  const userSnapshot = await adminDb
    .collection("users")
    .doc(userId)
    .get();

  if (!userSnapshot.exists) {
    throw new Error("USER_NOT_FOUND");
  }

  const legacyClasses = Number(
    userSnapshot.data()?.journeyLegacyClasses ?? 0
  );

  if (
    !Number.isSafeInteger(legacyClasses) ||
    legacyClasses < 0
  ) {
    throw new Error("INVALID_LEGACY_CLASSES");
  }

  const bookingsSnapshot = await adminDb
    .collection("bookings")
    .where("userId", "==", userId)
    .get();

  const systemClasses = bookingsSnapshot.docs.filter(
    (bookingDocument) => {
      const booking = bookingDocument.data();

      if (booking.attendanceStatus !== "present") {
        return false;
      }

      return (
        booking.status === "booked" ||
        (
          booking.status === "admin_cancelled" &&
          booking.cancellationMode === "after_compensation"
        )
      );
    }
  ).length;

  const completedClasses =
    legacyClasses + systemClasses;

  if (!Number.isSafeInteger(completedClasses)) {
    throw new Error("INVALID_COMPLETED_CLASSES");
  }

  return completedClasses;
}

function getTaiwanDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  const day = parts.find(
    (part) => part.type === "day"
  )?.value;

  if (!year || !month || !day) {
    throw new Error("INVALID_DATE");
  }

  return `${year}-${month}-${day}`;
}

function serializeGift(
  userId: string,
  milestoneClasses: MilestoneLevel,
  data?: Partial<GiftRecord>
) {
  return {
    userId,
    milestoneClasses,
    status: data?.status ?? "not_claimed",
    claimedAt: data?.claimedAt ?? null,
    updatedBy: data?.updatedBy ?? null,
  };
}

// 查詢會員的實體禮物紀錄
export async function GET(request: NextRequest) {
  try {
    const adminUserId =
      await getAdminUserId(request);

    if (!adminUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "沒有管理員權限。",
        },
        { status: 403 }
      );
    }

    const userId =
      request.nextUrl.searchParams.get("userId")?.trim();

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "請提供會員 ID。",
        },
        { status: 400 }
      );
    }

    const userSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "找不到會員。",
        },
        { status: 404 }
      );
    }

    const completedClasses =
      await getCompletedClasses(userId);

    const giftSnapshots = await Promise.all(
      MILESTONES.map((level) =>
        adminDb
          .collection("journeyGifts")
          .doc(`${userId}_${level}`)
          .get()
      )
    );

    const gifts = MILESTONES.map(
      (milestoneClasses, index) => {
        const snapshot = giftSnapshots[index];

        const data = snapshot.exists
          ? (snapshot.data() as GiftRecord)
          : undefined;

        return {
          ...serializeGift(
            userId,
            milestoneClasses,
            data
          ),
          eligible:
            completedClasses >= milestoneClasses,
        };
      }
    );

    return NextResponse.json({
      success: true,
      userId,
      completedClasses,
      gifts,
    });
  } catch (error) {
    console.error("讀取實體禮物紀錄失敗：", error);

    return NextResponse.json(
      {
        success: false,
        error: "讀取禮物紀錄失敗。",
      },
      { status: 500 }
    );
  }
}

// 管理員更新實體禮物狀態
export async function POST(request: NextRequest) {
  try {
    const adminUserId =
      await getAdminUserId(request);

    if (!adminUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "沒有管理員權限。",
        },
        { status: 403 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "請提供正確的資料格式。",
        },
        { status: 400 }
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("userId" in body) ||
      !("milestoneClasses" in body) ||
      !("status" in body)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "缺少必要欄位。",
        },
        { status: 400 }
      );
    }

    const userId = body.userId;
    const milestoneClasses =
      body.milestoneClasses;
    const status = body.status;

    if (
      typeof userId !== "string" ||
      !userId.trim() ||
      userId.includes("/") ||
      !isMilestoneLevel(milestoneClasses) ||
      !isGiftStatus(status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "禮物資料格式不正確。",
        },
        { status: 400 }
      );
    }

    const completedClasses =
      await getCompletedClasses(userId);

    if (completedClasses < milestoneClasses) {
      return NextResponse.json(
        {
          success: false,
          error:
            `會員目前累積 ${completedClasses} 堂，` +
            `尚未達成 ${milestoneClasses} 堂。`,
        },
        { status: 403 }
      );
    }

    const giftRef = adminDb
      .collection("journeyGifts")
      .doc(`${userId}_${milestoneClasses}`);

    const now = new Date();
    const claimedAt =
      status === "claimed"
        ? getTaiwanDate(now)
        : null;

    const updatedGift = await adminDb.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(giftRef);

        const previousData = snapshot.exists
          ? (snapshot.data() as GiftRecord)
          : null;

        const previousStatus =
          previousData?.status ?? "not_claimed";

        // 狀態不變時不重複建立操作紀錄
        if (previousStatus === status) {
          return serializeGift(
            userId,
            milestoneClasses,
            previousData ?? undefined
          );
        }

        // 已領取後若要更正，仍保留操作歷程
        const nextClaimedAt =
          status === "claimed"
            ? previousData?.claimedAt ??
              claimedAt
            : null;

        const nextData = {
          userId,
          milestoneClasses,
          status,
          claimedAt: nextClaimedAt,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: adminUserId,
        };

        transaction.set(giftRef, nextData);

        const logRef = giftRef
          .collection("history")
          .doc();

        transaction.set(logRef, {
          userId,
          milestoneClasses,
          previousStatus,
          newStatus: status,
          previousClaimedAt:
            previousData?.claimedAt ?? null,
          claimedAt: nextClaimedAt,
          updatedBy: adminUserId,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return serializeGift(
          userId,
          milestoneClasses,
          nextData
        );
      }
    );

    return NextResponse.json({
      success: true,
      gift: updatedGift,
    });
  } catch (error) {
    console.error("更新實體禮物狀態失敗：", error);

    if (
      error instanceof Error &&
      error.message === "USER_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "找不到會員資料。",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "更新禮物狀態失敗，請稍後再試。",
      },
      { status: 500 }
    );
  }
}
