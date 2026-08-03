import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type BookClassParams = {
  userId: string;
  classId: string;
};

export async function bookClass({
  userId,
  classId,
}: BookClassParams) {
  const userRef = doc(db, "users", userId);
  const classRef = doc(db, "classes", classId);

  // 同一位學生對同一堂課只會有一個固定預約 ID
  const bookingId = `${userId}_${classId}`;
  const bookingRef = doc(db, "bookings", bookingId);

  const pointTransactionRef = doc(
    db,
    "pointTransactions",
    bookingId
  );

  return runTransaction(db, async (transaction) => {
    // Transaction 規定先讀取，再進行寫入
    const userSnapshot = await transaction.get(userRef);
    const classSnapshot = await transaction.get(classRef);
    const bookingSnapshot = await transaction.get(bookingRef);

    if (!userSnapshot.exists()) {
      throw new Error("找不到會員資料");
    }

    if (!classSnapshot.exists()) {
      throw new Error("找不到課程資料");
    }

    if (bookingSnapshot.exists()) {
      const existingBooking = bookingSnapshot.data();

      if (existingBooking.status === "booked") {
        throw new Error("你已經預約過這堂課");
      }

      throw new Error("這堂課已有預約紀錄");
    }

    const userData = userSnapshot.data();
    const classData = classSnapshot.data();

    const currentPoints = Number(userData.points ?? 0);
    const pointsRequired = Number(classData.pointsRequired ?? 0);
    const bookedCount = Number(classData.bookedCount ?? 0);
    const capacity = Number(classData.capacity ?? 0);
    const status = String(classData.status ?? "");

    if (status !== "open") {
      throw new Error("這堂課目前無法預約");
    }

    if (capacity <= 0) {
      throw new Error("課程名額設定不正確");
    }

    if (bookedCount >= capacity) {
      throw new Error("這堂課已經滿班");
    }

    if (pointsRequired <= 0) {
      throw new Error("課程點數設定不正確");
    }

    if (currentPoints < pointsRequired) {
      throw new Error("點數不足，無法預約");
    }

    if (!(classData.startTime instanceof Timestamp)) {
      throw new Error("課程時間設定不正確");
    }

    const remainingPoints = currentPoints - pointsRequired;

    // 扣除會員點數
    transaction.update(userRef, {
      points: remainingPoints,
    });

    // 課程預約人數 +1
    transaction.update(classRef, {
      bookedCount: bookedCount + 1,
    });

    // 建立預約紀錄
    transaction.set(bookingRef, {
      userId,
      classId,
      courseName: String(classData.courseName ?? ""),
      classStartTime: classData.startTime,
      pointsUsed: pointsRequired,
      status: "booked",
      createdAt: serverTimestamp(),
      cancelledAt: null,
    });

    // 建立點數異動紀錄
    transaction.set(pointTransactionRef, {
      userId,
      bookingId,
      classId,
      courseName: String(classData.courseName ?? ""),
      type: "booking",
      amount: -pointsRequired,
      balanceAfter: remainingPoints,
      createdAt: serverTimestamp(),
    });

    return {
      bookingId,
      remainingPoints,
    };
  });
}