import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import {
  AERIAL_MILESTONES,
  getUnlockedMilestones,
  getNextMilestone,
  getJourneyProgress,
} from "@/lib/aerialJourney";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入會員帳號。" },
        { status: 401 }
      );
    }

    let userId: string;

    try {
      const decoded = await adminAuth.verifyIdToken(
        authorization.slice(7)
      );

      // 只能取得登入者自己的旅程
      userId = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "登入已失效，請重新登入。" },
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

    const legacyClasses = Number(
      userSnapshot.data()?.journeyLegacyClasses ?? 0
    );

    if (
      !Number.isSafeInteger(legacyClasses) ||
      legacyClasses < 0
    ) {
      return NextResponse.json(
        { error: "歷史堂數資料不正確。" },
        { status: 409 }
      );
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

    const completedClasses = legacyClasses + systemClasses;

    if (!Number.isSafeInteger(completedClasses)) {
      return NextResponse.json(
        { error: "累積堂數資料超出可處理範圍。" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      legacyClasses,
      systemClasses,
      completedClasses,
      unlockedMilestones: getUnlockedMilestones(completedClasses),
      nextMilestone: getNextMilestone(completedClasses),
      journeyProgress: getJourneyProgress(completedClasses),
      allMilestones: AERIAL_MILESTONES,
    });
  } catch (error) {
    console.error("會員空中旅程統計失敗：", error);

    return NextResponse.json(
      { error: "讀取空中旅程失敗，請稍後再試。" },
      { status: 500 }
    );
  }
}