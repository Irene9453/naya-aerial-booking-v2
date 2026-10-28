
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { AERIAL_MILESTONES } from "@/lib/aerialJourney";

export const runtime = "nodejs";

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );
    return decoded.uid;
  } catch {
    return null;
  }
}

function countSystemClasses(
  bookings: FirebaseFirestore.QuerySnapshot
) {
  return bookings.docs.filter((bookingDocument) => {
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
  }).length;
}

// 讀取會員已慶祝過的里程碑
export async function GET(request: NextRequest) {
  try {
    const userId = await authenticate(request);

    if (!userId) {
      return NextResponse.json(
        { error: "請先登入會員帳號。" },
        { status: 401 }
      );
    }

    const userSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        { error: "找不到會員資料。" },
        { status: 404 }
      );
    }

    const celebrated =
      userSnapshot.data()?.journeyCelebratedMilestones;

    const celebratedMilestones = Array.isArray(celebrated)
      ? celebrated.filter(
          (value): value is number =>
            typeof value === "number" &&
            AERIAL_MILESTONES.some(
              (milestone) => milestone.classes === value
            )
        )
      : [];

    return NextResponse.json({
      success: true,
      celebratedMilestones,
    });
  } catch (error) {
    console.error("讀取里程碑慶祝紀錄失敗：", error);

    return NextResponse.json(
      { error: "讀取慶祝紀錄失敗，請稍後再試。" },
      { status: 500 }
    );
  }
}

// 確認會員已看過指定里程碑的慶祝畫面
export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);

    if (!userId) {
      return NextResponse.json(
        { error: "請先登入會員帳號。" },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "請提供有效的 JSON 資料。" },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      !("milestoneClasses" in body)
    ) {
      return NextResponse.json(
        { error: "請提供里程碑堂數。" },
        { status: 400 }
      );
    }

    const milestoneClasses = (
      body as { milestoneClasses: unknown }
    ).milestoneClasses;

    if (
      typeof milestoneClasses !== "number" ||
      !AERIAL_MILESTONES.some(
        (milestone) => milestone.classes === milestoneClasses
      )
    ) {
      return NextResponse.json(
        { error: "無效的里程碑堂數。" },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection("users").doc(userId);

    const bookingsSnapshot = await adminDb
      .collection("bookings")
      .where("userId", "==", userId)
      .get();

    const systemClasses = countSystemClasses(bookingsSnapshot);

    const result = await adminDb.runTransaction(
      async (transaction) => {
        const userSnapshot = await transaction.get(userRef);

        if (!userSnapshot.exists) {
          return { error: "找不到會員資料。", status: 404 };
        }

        const legacyClasses = Number(
          userSnapshot.data()?.journeyLegacyClasses ?? 0
        );

        if (
          !Number.isSafeInteger(legacyClasses) ||
          legacyClasses < 0
        ) {
          return { error: "歷史堂數資料不正確。", status: 409 };
        }

        const completedClasses = legacyClasses + systemClasses;

        if (!Number.isSafeInteger(completedClasses)) {
          return { error: "累積堂數資料不正確。", status: 409 };
        }

        if (completedClasses < milestoneClasses) {
          return {
            error: "尚未達成此里程碑，無法記錄慶祝狀態。",
            status: 403,
          };
        }

        const celebrated =
          userSnapshot.data()?.journeyCelebratedMilestones;

        if (
          Array.isArray(celebrated) &&
          celebrated.includes(milestoneClasses)
        ) {
          return { success: true, alreadyCelebrated: true };
        }

        transaction.update(userRef, {
          journeyCelebratedMilestones:
            FieldValue.arrayUnion(milestoneClasses),
        });

        return { success: true, alreadyCelebrated: false };
      }
    );

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("記錄里程碑慶祝狀態失敗：", error);

    return NextResponse.json(
      { error: "儲存慶祝紀錄失敗，請稍後再試。" },
      { status: 500 }
    );
  }
}
