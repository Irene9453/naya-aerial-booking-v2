import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type AdjustPointsParams = {
  adminId: string;
  studentId: string;
  amount: number;
  note: string;
};

export async function adjustStudentPoints({
  adminId,
  studentId,
  amount,
  note,
}: AdjustPointsParams) {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("點數異動必須是非零整數");
  }

  const adminRef = doc(db, "users", adminId);
  const studentRef = doc(db, "users", studentId);

  const transactionRef = doc(
    db,
    "pointTransactions",
    `admin_${studentId}_${Date.now()}`
  );

  return runTransaction(db, async (transaction) => {
    const adminSnapshot = await transaction.get(adminRef);
    const studentSnapshot = await transaction.get(studentRef);

    if (!adminSnapshot.exists()) {
      throw new Error("找不到管理員資料");
    }

    if (adminSnapshot.data().role !== "admin") {
      throw new Error("你沒有管理員權限");
    }

    if (!studentSnapshot.exists()) {
      throw new Error("找不到學生資料");
    }

    const currentPoints = Number(
      studentSnapshot.data().points ?? 0
    );

    const newBalance = currentPoints + amount;

    if (newBalance < 0) {
      throw new Error("扣除後點數不可小於 0");
    }

    transaction.update(studentRef, {
      points: newBalance,
    });

    transaction.set(transactionRef, {
      userId: studentId,
      adminId,
      type: amount > 0 ? "admin_add" : "admin_deduct",
      amount,
      note,
      balanceAfter: newBalance,
      createdAt: serverTimestamp(),
    });

    return {
      newBalance,
    };
  });
}