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
        { error: "請先登入管理員帳號" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (adminSnapshot.data()?.role !== "admin") {
      return NextResponse.json(
        { error: "你沒有管理員權限" },
        { status: 403 }
      );
    }

    const userId = request.nextUrl.searchParams.get("userId");

    if (
      !userId ||
      userId.includes("/") ||
      userId.length > 150
    ) {
      return NextResponse.json(
        { error: "會員編號不正確" },
        { status: 400 }
      );
    }

    const userSnapshot = await adminDb
      .collection("users")
      .doc(userId)
      .get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        { error: "找不到會員" },
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
        { error: "歷史堂數資料不正確" },
        { status: 409 }
      );
    }

    // 讀取這位學生的所有預約紀錄
    const bookingsSnapshot = await adminDb
      .collection("bookings")
      .where("userId", "==", userId)
      .get();

    // 僅統計有效出席的預約
    const attendedBookings = bookingsSnapshot.docs.filter(
      (bookingDocument) => {
        const booking = bookingDocument.data();

        if (booking.attendanceStatus !== "present") {
          return false;
        }

        if (booking.status === "booked") {
          return true;
        }

        return (
          booking.status === "admin_cancelled" &&
          booking.cancellationMode === "after_compensation"
        );
      }
    );

    const systemClasses = attendedBookings.length;
    const completedClasses = legacyClasses + systemClasses;

    if (!Number.isSafeInteger(completedClasses)) {
      return NextResponse.json(
        { error: "累積堂數超出可處理範圍" },
        { status: 409 }
      );
    }

    const unlockedMilestones =
      getUnlockedMilestones(completedClasses);

    const nextMilestone =
      getNextMilestone(completedClasses);

    return NextResponse.json({
      success: true,
      userId,
      legacyClasses,
      systemClasses,
      completedClasses,
      unlockedMilestones,
      nextMilestone,
      journeyProgress: getJourneyProgress(completedClasses),
      allMilestones: AERIAL_MILESTONES,
    });
  } catch (error) {
    console.error("Journey 統計 API 錯誤：", error);

    return NextResponse.json(
      { error: "無法取得空中旅程資料，請稍後再試" },
      { status: 500 }
    );
  }
}