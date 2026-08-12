import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type AttendanceStatus =
  | "present"
  | "absent"
  | null;

type UpdateAttendanceParams = {
  bookingId: string;
  status: AttendanceStatus;
};

export type AttendanceRewardResult = {
  status: AttendanceStatus;
  rewardChange: number;
  newRewardBalance: number;
};

const ATTENDANCE_REWARD_POINTS = 9;

export async function updateAttendanceWithReward({
  bookingId,
  status,
}: UpdateAttendanceParams): Promise<AttendanceRewardResult> {
  const bookingRef = doc(db, "bookings", bookingId);

  return runTransaction(db, async (transaction) => {
    const bookingSnapshot =
      await transaction.get(bookingRef);

    if (!bookingSnapshot.exists()) {
      throw new Error("找不到預約紀錄");
    }

    const bookingData = bookingSnapshot.data();
    const userId = String(bookingData.userId ?? "");

    if (!userId) {
      throw new Error("預約紀錄缺少會員資料");
    }

    const userRef = doc(db, "users", userId);

    const userSnapshot =
      await transaction.get(userRef);

    if (!userSnapshot.exists()) {
      throw new Error("找不到會員資料");
    }

    const userData = userSnapshot.data();

    const currentRewardPoints = Number(
      userData.rewardPoints ?? 0
    );

    const rewardGranted = Boolean(
      bookingData.rewardGranted ?? false
    );

    const currentRewardCycle = Number(
      bookingData.rewardCycle ?? 0
    );

    // 點名為已到，且這筆預約尚未發過紅利
    if (status === "present" && !rewardGranted) {
      const nextRewardCycle =
        currentRewardCycle + 1;

      const newRewardBalance =
        currentRewardPoints +
        ATTENDANCE_REWARD_POINTS;

      const rewardTransactionRef = doc(
        db,
        "rewardTransactions",
        `${bookingId}_attendance_grant_${nextRewardCycle}`
      );

      transaction.update(userRef, {
        rewardPoints: newRewardBalance,
      });

      transaction.update(bookingRef, {
        attendanceStatus: "present",
        attendedAt: serverTimestamp(),
        rewardGranted: true,
        rewardPointsGranted:
          ATTENDANCE_REWARD_POINTS,
        rewardGrantedAt: serverTimestamp(),
        rewardCycle: nextRewardCycle,
      });

      transaction.set(rewardTransactionRef, {
        userId,
        bookingId,
        classId: String(
          bookingData.classId ?? ""
        ),
        courseName: String(
          bookingData.courseName ?? ""
        ),
        type: "attendance",
        amount: ATTENDANCE_REWARD_POINTS,
        balanceAfter: newRewardBalance,
        rewardCycle: nextRewardCycle,
        createdAt: serverTimestamp(),
      });

      return {
        status,
        rewardChange:
          ATTENDANCE_REWARD_POINTS,
        newRewardBalance,
      };
    }

    // 原本已到並獲得紅利，後來改成缺席或清除
    if (
      status !== "present" &&
      rewardGranted
    ) {
      const grantedPoints = Number(
        bookingData.rewardPointsGranted ??
          ATTENDANCE_REWARD_POINTS
      );

      const newRewardBalance = Math.max(
        0,
        currentRewardPoints - grantedPoints
      );

      const reversalTransactionRef = doc(
        db,
        "rewardTransactions",
        `${bookingId}_attendance_reversal_${currentRewardCycle}`
      );

      transaction.update(userRef, {
        rewardPoints: newRewardBalance,
      });

      transaction.update(bookingRef, {
        attendanceStatus: status,
        attendedAt: null,
        rewardGranted: false,
        rewardPointsGranted: 0,
        rewardReversedAt: serverTimestamp(),
      });

      transaction.set(
        reversalTransactionRef,
        {
          userId,
          bookingId,
          classId: String(
            bookingData.classId ?? ""
          ),
          courseName: String(
            bookingData.courseName ?? ""
          ),
          type: "attendance_reversal",
          amount: -grantedPoints,
          balanceAfter: newRewardBalance,
          rewardCycle: currentRewardCycle,
          createdAt: serverTimestamp(),
        }
      );

      return {
        status,
        rewardChange: -grantedPoints,
        newRewardBalance,
      };
    }

    // 沒有紅利異動，只更新點名狀態
    transaction.update(bookingRef, {
      attendanceStatus: status,
      attendedAt:
        status === "present"
          ? serverTimestamp()
          : null,
    });

    return {
      status,
      rewardChange: 0,
      newRewardBalance:
        currentRewardPoints,
    };
  });
}