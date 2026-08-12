import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type UseSpecialLeaveParams = {
  userId: string;
  bookingId: string;
  classId: string;
};

function getHalfYearKey(date: Date) {
  const year = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(date)
  );

  const month = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(date)
  );

  const periodHalf = month <= 6 ? 1 : 2;

  return {
    periodYear: year,
    periodHalf,
    periodKey: `${year}-H${periodHalf}`,
  };
}

export async function useSpecialLeave({
  userId,
  bookingId,
  classId,
}: UseSpecialLeaveParams) {
  const now = new Date();
  const { periodYear, periodHalf, periodKey } =
    getHalfYearKey(now);

  // 先確認本期是否已使用過
  const leaveQuery = query(
    collection(db, "specialLeaveRecords"),
    where("userId", "==", userId),
    where("periodKey", "==", periodKey),
    where("status", "==", "approved")
  );

  const leaveSnapshot = await getDocs(leaveQuery);

  if (!leaveSnapshot.empty) {
    throw new Error(
      `你已使用 ${periodYear} 年${periodHalf === 1 ? "上半年" : "下半年"}的特殊請假額度。`
    );
  }

  const userRef = doc(db, "users", userId);
  const bookingRef = doc(db, "bookings", bookingId);
  const classRef = doc(db, "classes", classId);

  const specialLeaveRef = doc(
    db,
    "specialLeaveRecords",
    `${bookingId}_${periodKey}`
  );

  const refundTransactionRef = doc(
    db,
    "pointTransactions",
    `${bookingId}_special_leave_refund`
  );

  const notificationRef = doc(
    db,
    "notifications",
    `${bookingId}_special_leave`
  );

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const bookingSnapshot = await transaction.get(bookingRef);
    const classSnapshot = await transaction.get(classRef);

    if (!userSnapshot.exists()) {
      throw new Error("找不到會員資料");
    }

    if (!bookingSnapshot.exists()) {
      throw new Error("找不到預約紀錄");
    }

    if (!classSnapshot.exists()) {
      throw new Error("找不到課程資料");
    }

    const userData = userSnapshot.data();
    const bookingData = bookingSnapshot.data();
    const classData = classSnapshot.data();

    if (bookingData.userId !== userId) {
      throw new Error("你無權使用此筆預約的特殊請假");
    }

    if (bookingData.status !== "booked") {
      throw new Error("此預約目前無法使用特殊請假");
    }

    const bookedCount = Number(classData.bookedCount ?? 0);

    // 3 人以下不適用，4 人以上才可使用
    if (bookedCount <= 3) {
      throw new Error(
        "此堂課目前預約人數為 3 人以下，無法使用特殊請假。"
      );
    }

    const pointsUsed = Number(bookingData.pointsUsed ?? 0);
    const currentPoints = Number(userData.points ?? 0);

    if (pointsUsed <= 0) {
      throw new Error("預約點數資料不正確");
    }

    const newPointBalance = currentPoints + pointsUsed;
    const newBookedCount = Math.max(0, bookedCount - 1);

    const classStartTime =
      classData.startTime instanceof Timestamp
        ? classData.startTime
        : null;

    const courseName = String(
      bookingData.courseName ??
        classData.courseName ??
        ""
    );

    const studentName = String(userData.name ?? "");

    // 退點
    transaction.update(userRef, {
      points: newPointBalance,
    });

    // 課程人數 -1
    transaction.update(classRef, {
      bookedCount: newBookedCount,
    });

    // 預約改為特殊請假
    transaction.update(bookingRef, {
      status: "special_leave",
      specialLeaveAt: serverTimestamp(),
      pointsRefunded: pointsUsed,
    });

    // 建立特殊請假紀錄
    transaction.set(specialLeaveRef, {
      userId,
      studentName,
      bookingId,
      classId,
      courseName,
      classStartTime,

      periodYear,
      periodHalf,
      periodKey,

      reason: "特殊請假",
      pointsRefunded: pointsUsed,
      bookedCountBefore: bookedCount,
      refunded: true,

      status: "approved",
      usedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });

    // 建立點數退回紀錄
    transaction.set(refundTransactionRef, {
      userId,
      bookingId,
      classId,
      courseName,

      type: "special_leave_refund",
      amount: pointsUsed,
      balanceAfter: newPointBalance,

      createdAt: serverTimestamp(),
    });

    // 建立通知
    transaction.set(notificationRef, {
      userId,
      bookingId,
      classId,
      type: "special_leave",
      title: "特殊請假成功",
      body: `已完成 ${courseName} 的特殊請假，並退回 ${pointsUsed} 點。`,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    return {
      refundedPoints: pointsUsed,
      newPointBalance,
      periodYear,
      periodHalf,
      periodKey,
    };
  });
}