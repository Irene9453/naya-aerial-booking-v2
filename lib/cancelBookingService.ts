import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type CancelBookingParams = {
  userId: string;
  bookingId: string;
  classId: string;
};

function getCancellationDeadline(classStartTime: Timestamp) {
  const classDate = classStartTime.toDate();

  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(classDate);

  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("無法計算取消期限");
  }

  // 上課當天 00:00（台灣時間）的前 1 毫秒
  // 就是前一天 23:59:59.999
  const classDayStart = new Date(
    `${year}-${month}-${day}T00:00:00+08:00`
  );

  return new Date(classDayStart.getTime() - 1);
}

export async function cancelBooking({
  userId,
  bookingId,
  classId,
}: CancelBookingParams) {
  const userRef = doc(db, "users", userId);
  const classRef = doc(db, "classes", classId);
  const bookingRef = doc(db, "bookings", bookingId);

  const refundTransactionRef = doc(
    db,
    "pointTransactions",
    `${bookingId}_refund`
  );

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const classSnapshot = await transaction.get(classRef);
    const bookingSnapshot = await transaction.get(bookingRef);
    const refundSnapshot = await transaction.get(
      refundTransactionRef
    );

    if (!userSnapshot.exists()) {
      throw new Error("找不到會員資料");
    }

    if (!classSnapshot.exists()) {
      throw new Error("找不到課程資料");
    }

    if (!bookingSnapshot.exists()) {
      throw new Error("找不到預約紀錄");
    }

    const bookingData = bookingSnapshot.data();
    const classData = classSnapshot.data();
    const userData = userSnapshot.data();

    if (bookingData.userId !== userId) {
      throw new Error("你無權取消此預約");
    }

    if (bookingData.status !== "booked") {
      throw new Error("這筆預約已取消或無法取消");
    }

    if (refundSnapshot.exists()) {
      throw new Error("此預約已經退回點數");
    }

    if (!(classData.startTime instanceof Timestamp)) {
      throw new Error("課程時間設定不正確");
    }

    const cancellationDeadline = getCancellationDeadline(
      classData.startTime
    );

    if (new Date() > cancellationDeadline) {
      throw new Error(
        "已超過取消期限。課程最晚須於上課前一天 23:59 前取消。"
      );
    }

    const pointsUsed = Number(bookingData.pointsUsed ?? 0);
    const currentPoints = Number(userData.points ?? 0);
    const bookedCount = Number(classData.bookedCount ?? 0);

    if (pointsUsed <= 0) {
      throw new Error("預約點數資料不正確");
    }

    const newPointBalance = currentPoints + pointsUsed;
    const newBookedCount = Math.max(0, bookedCount - 1);

    // 退回會員點數
    transaction.update(userRef, {
      points: newPointBalance,
    });

    // 課程人數 -1
    transaction.update(classRef, {
      bookedCount: newBookedCount,
    });

    // 預約改為已取消，不直接刪除
    transaction.update(bookingRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      pointsRefunded: pointsUsed,
    });

    // 建立退點紀錄
    transaction.set(refundTransactionRef, {
      userId,
      bookingId,
      classId,
      courseName: String(bookingData.courseName ?? ""),
      type: "refund",
      amount: pointsUsed,
      balanceAfter: newPointBalance,
      createdAt: serverTimestamp(),
    });

    return {
      refundedPoints: pointsUsed,
      newPointBalance,
      cancellationDeadline,
    };
  });
}