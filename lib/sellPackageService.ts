import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type SellPackageParams = {
  adminId: string;
  studentId: string;
  packageId: string;
};

export async function sellPackage({
  adminId,
  studentId,
  packageId,
}: SellPackageParams) {
  const adminRef = doc(db, "users", adminId);
  const studentRef = doc(db, "users", studentId);
  const packageRef = doc(db, "packages", packageId);

  const operationId = `${Date.now()}_${crypto.randomUUID()}`;

  const saleRef = doc(
    db,
    "packageSales",
    `sale_${studentId}_${operationId}`
  );

  const pointTransactionRef = doc(
    db,
    "pointTransactions",
    `package_${studentId}_${operationId}`
  );

  const notificationRef = doc(
    db,
    "notifications",
    `package_${studentId}_${operationId}`
  );

  return runTransaction(db, async (transaction) => {
    const adminSnapshot = await transaction.get(adminRef);
    const studentSnapshot = await transaction.get(studentRef);
    const packageSnapshot = await transaction.get(packageRef);

    if (!adminSnapshot.exists()) {
      throw new Error("找不到管理員資料");
    }

    if (adminSnapshot.data().role !== "admin") {
      throw new Error("你沒有管理員權限");
    }

    if (!studentSnapshot.exists()) {
      throw new Error("找不到學生資料");
    }

    if (!packageSnapshot.exists()) {
      throw new Error("找不到課卡商品");
    }

    const studentData = studentSnapshot.data();
    const packageData = packageSnapshot.data();

    if (packageData.isActive !== true) {
      throw new Error("這張課卡目前已停用");
    }

    const currentPoints = Number(studentData.points ?? 0);
    const packagePoints = Number(packageData.points ?? 0);
    const packagePrice = Number(packageData.price ?? 0);
    const packageName = String(packageData.name ?? "");

    if (!Number.isInteger(packagePoints) || packagePoints <= 0) {
      throw new Error("課卡點數設定不正確");
    }

    if (!Number.isInteger(packagePrice) || packagePrice < 0) {
      throw new Error("課卡價格設定不正確");
    }

    const newBalance = currentPoints + packagePoints;

    transaction.update(studentRef, {
      points: newBalance,
    });

    transaction.set(saleRef, {
      adminId,
      studentId,
      packageId,
      packageName,
      points: packagePoints,
      price: packagePrice,
      status: "completed",
      createdAt: serverTimestamp(),
    });

    transaction.set(pointTransactionRef, {
      userId: studentId,
      adminId,
      packageId,
      packageName,
      type: "package_purchase",
      amount: packagePoints,
      note: `購買 ${packageName}`,
      balanceAfter: newBalance,
      createdAt: serverTimestamp(),
    });

    transaction.set(notificationRef, {
      userId: studentId,
      type: "package_purchase",
      title: "課卡購買成功",
      body: `已購買 ${packageName}，增加 ${packagePoints} 點。目前共有 ${newBalance} 點。`,
      packageId,
      packageName,
      pointsAdded: packagePoints,
      price: packagePrice,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    return {
      packageName,
      packagePoints,
      packagePrice,
      newBalance,
    };
  });
}