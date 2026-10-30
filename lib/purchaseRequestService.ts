import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type CompletePurchaseRequestParams = {
  requestId: string;
  adminId: string;
};

type RejectPurchaseRequestParams = {
  requestId: string;
  adminId: string;
  reason?: string;
};

export async function completePurchaseRequest({
  requestId,
  adminId,
}: CompletePurchaseRequestParams) {
  const requestRef = doc(
    db,
    "purchaseRequests",
    requestId
  );

  const adminRef = doc(
    db,
    "users",
    adminId
  );

  return runTransaction(
    db,
    async (transaction) => {
      // =========================
      // 1. 讀取購買申請
      // =========================

      const requestSnapshot =
        await transaction.get(requestRef);

      if (!requestSnapshot.exists()) {
        throw new Error("找不到購買申請");
      }

      const requestData =
        requestSnapshot.data();

      // =========================
      // 2. 讀取管理員
      // =========================

      const adminSnapshot =
        await transaction.get(adminRef);

      if (!adminSnapshot.exists()) {
        throw new Error("找不到管理員資料");
      }

      if (
        adminSnapshot.data().role !== "admin"
      ) {
        throw new Error("你沒有管理員權限");
      }

      // =========================
      // 3. 檢查訂單狀態
      // =========================

      if (
        requestData.status === "completed"
      ) {
        throw new Error(
          "此筆購買申請已完成"
        );
      }

      if (
        requestData.status === "rejected"
      ) {
        throw new Error(
          "此筆購買申請已被拒絕"
        );
      }

      if (
        requestData.status !== "pending"
      ) {
        throw new Error(
          "此筆申請目前無法確認"
        );
      }

      // =========================
      // 4. 取得基本資料
      // =========================

      const userId = String(
        requestData.userId ?? ""
      );

      const packageId = String(
        requestData.packageId ?? ""
      );

      if (!userId) {
        throw new Error(
          "購買申請缺少會員資料"
        );
      }

      const userRef = doc(
        db,
        "users",
        userId
      );

      const userSnapshot =
        await transaction.get(userRef);

      if (!userSnapshot.exists()) {
        throw new Error(
          "找不到學生會員資料"
        );
      }


const userData = userSnapshot.data();

      // =========================
      // 5. 後端重新驗證課卡與價格
      // =========================

      const packageRef = doc(
        db,
        "packages",
        packageId
      );

      const packageSnapshot =
        await transaction.get(packageRef);

      if (!packageSnapshot.exists()) {
        throw new Error("找不到課卡商品");
      }

      const packageData = packageSnapshot.data();

      if (packageData.isActive !== true) {
        throw new Error("此課卡目前已停用");
      }

      const currentPoints = Number(userData.points ?? 0);
      const packagePoints = Number(packageData.points ?? 0);
      const originalPrice = Number(packageData.price ?? 0);
      const packageName = String(packageData.name ?? "");

      if (!Number.isSafeInteger(currentPoints) || currentPoints < 0) {
        throw new Error("會員點數資料不正確");
      }
      if (!Number.isSafeInteger(packagePoints) || packagePoints <= 0) {
        throw new Error("課卡點數資料不正確");
      }
      if (!Number.isSafeInteger(originalPrice) || originalPrice < 0) {
        throw new Error("課卡價格資料不正確");
      }

      if (
        Number(requestData.packagePoints) !== packagePoints ||
        String(requestData.packageName ?? "") !== packageName
      ) {
        throw new Error("購買申請的課卡資料已變更，請重新建立申請");
      }

      // =========================
      // 6. 驗證優惠券與訂單金額
      // =========================

      const couponSource = String(requestData.couponSource ?? "");
      const couponId = String(requestData.couponId ?? "");
      const couponCode = String(requestData.couponCode ?? "");
      const couponName = String(requestData.couponName ?? "");

      let verifiedDiscountRate = 1;
      let birthdayUseRef: ReturnType<typeof doc> | null = null;
      let userCouponRef: ReturnType<typeof doc> | null = null;

      const taipeiNow = new Date();
      const currentTaipeiYear = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Taipei",
          year: "numeric",
        }).format(taipeiNow)
      );
      const currentTaipeiMonth = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "Asia/Taipei",
          month: "numeric",
        }).format(taipeiNow)
      );

      if (couponSource === "birthday") {
        const birthdayMonth = Number(userData.birthdayMonth ?? 0);
        if (!birthdayMonth) {
          throw new Error("此會員尚未設定生日資料，無法使用生日優惠。");
        }
        if (birthdayMonth !== currentTaipeiMonth) {
          throw new Error("目前不是此會員的生日月份，無法使用生日 7 折優惠。");
        }

        birthdayUseRef = doc(
          db,
          "birthdayCouponUsage",
          `${userId}_${currentTaipeiYear}`
        );
        const birthdayUseSnapshot = await transaction.get(birthdayUseRef);
        if (birthdayUseSnapshot.exists()) {
          throw new Error("此會員今年已使用過生日 7 折優惠。");
        }
        verifiedDiscountRate = 0.7;
      } else if (couponSource === "new_student") {
        if (userData.isNewStudent !== true) {
          throw new Error("此會員不符合新生優惠資格");
        }

        verifiedDiscountRate = packagePoints >= 25 ? 0.85 : 0.9;
        const expectedCouponCode = packagePoints >= 25
          ? "new_student_85"
          : "new_student_90";
        if (couponCode !== expectedCouponCode) {
          throw new Error("新生優惠與課卡點數不符，請重新建立購買申請");
        }
      } else if (couponSource === "user_coupon") {
        if (!couponId) {
          throw new Error("優惠券資料不完整");
        }

        userCouponRef = doc(db, "userCoupons", couponId);
        const userCouponSnapshot = await transaction.get(userCouponRef);
        if (!userCouponSnapshot.exists()) {
          throw new Error("找不到此優惠券");
        }

        const userCouponData = userCouponSnapshot.data();
        if (String(userCouponData.userId ?? "") !== userId) {
          throw new Error("此優惠券不屬於該會員");
        }
        if (userCouponData.status !== "available") {
          throw new Error("此優惠券已使用或目前無法使用");
        }

        const minimumPackagePoints = Number(userCouponData.minimumPackagePoints ?? 0);
        const maximumPackagePoints = userCouponData.maximumPackagePoints == null
          ? null
          : Number(userCouponData.maximumPackagePoints);

        if (!Number.isFinite(minimumPackagePoints) || packagePoints < minimumPackagePoints) {
          throw new Error("此優惠券不適用於所選課卡");
        }
        if (
          maximumPackagePoints !== null &&
          (!Number.isFinite(maximumPackagePoints) || packagePoints > maximumPackagePoints)
        ) {
          throw new Error("此優惠券不適用於所選課卡");
        }

        verifiedDiscountRate = Number(userCouponData.discountRate);
        if (
          !Number.isFinite(verifiedDiscountRate) ||
          verifiedDiscountRate <= 0 ||
          verifiedDiscountRate > 1
        ) {
          throw new Error("優惠券折扣設定不正確");
        }
      } else if (couponSource !== "") {
        throw new Error("不支援的優惠券類型");
      }

      const discountAmount = Math.round(
        originalPrice * (1 - verifiedDiscountRate)
      );
      const finalPrice = originalPrice - discountAmount;

      // 不接受前端自行修改價格或折扣金額
      if (
        Number(requestData.originalPrice) !== originalPrice ||
        Number(requestData.discountAmount) !== discountAmount ||
        Number(requestData.finalPrice) !== finalPrice
      ) {
        throw new Error("訂單金額與系統計算結果不一致，請重新建立購買申請");
      }

      const newPointBalance = currentPoints + packagePoints;
      if (!Number.isSafeInteger(newPointBalance)) {
        throw new Error("會員點數超出可處理範圍");
      }

      // =========================
      // 7. 建立其他文件 reference
      // =========================

      const saleRef = doc(
        db,
        "packageSales",
        `request_${requestId}`
      );

      const pointTransactionRef = doc(
        db,
        "pointTransactions",
        `request_${requestId}`
      );

      const notificationRef = doc(
        db,
        "notifications",
        `request_${requestId}`
      );

      // =========================
      // 8. 更新學生點數
      // =========================

      const userUpdates: {
  points: number;
  isNewStudent?: boolean;
} = {
  points: newPointBalance,
};

      /*
       * 只有真的使用新生優惠，
       * 才取消新生資格。
       *
       * 如果學生這次選擇「不使用優惠」，
       * 仍保留新生優惠資格。
       */
      if (
        couponSource ===
        "new_student"
      ) {
        userUpdates.isNewStudent =
          false;
      }

      if (birthdayUseRef) {
  transaction.set(birthdayUseRef, {
    userId,
    year: Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Taipei",
        year: "numeric",
      }).format(new Date())
    ),
    requestId,
    couponSource: "birthday",
    discountRate: 0.7,
    usedAt: serverTimestamp(),
  });
}

transaction.update(
  userRef,
  userUpdates
);

      // =========================
      // 9. 核銷紅利優惠券
      // =========================

      if (
        couponSource ===
          "user_coupon" &&
        userCouponRef
      ) {
        transaction.update(
          userCouponRef,
          {
            status: "used",

            usedAt:
              serverTimestamp(),

            purchaseRequestId:
              requestId,

            usedPackageId:
              packageId,

            usedPackageName:
              packageName,

            discountAmount,
          }
        );
      }

      // =========================
      // 10. 完成購買申請
      // =========================

      transaction.update(
        requestRef,
        {
          status: "completed",
          paymentStatus:
            "confirmed",

          reviewedBy: adminId,
          reviewedAt:
            serverTimestamp(),

          completedAt:
            serverTimestamp(),

          pointBalanceAfter:
            newPointBalance,

          couponUsed:
            Boolean(couponSource),

          couponUsedAt:
            couponSource
              ? serverTimestamp()
              : null,
        }
      );

      // =========================
      // 11. 建立銷售紀錄
      // =========================

      transaction.set(
        saleRef,
        {
          requestId,

          adminId,

          studentId: userId,

          packageId,
          packageName,

          points: packagePoints,

          originalPrice,
          discountAmount,
          price: finalPrice,

          couponId:
            couponId || null,

          couponCode:
            couponCode || null,

          couponName:
            couponName || null,

          couponSource:
            couponSource || null,

          paymentMethod: String(
            requestData.paymentMethod ??
              ""
          ),

          transferLastFive:
            requestData.transferLastFive ??
            null,

          status: "completed",

          createdAt:
            serverTimestamp(),
        }
      );

      // =========================
      // 12. 建立課程點數紀錄
      // =========================

      transaction.set(
        pointTransactionRef,
        {
          userId,

          adminId,

          requestId,

          packageId,
          packageName,

          type:
            "package_purchase",

          amount:
            packagePoints,

          balanceAfter:
            newPointBalance,

          note:
            `購買 ${packageName}`,

          createdAt:
            serverTimestamp(),
        }
      );

      // =========================
      // 13. 建立會員通知
      // =========================

      const discountText =
        discountAmount > 0
          ? `，已使用「${
              couponName ||
              "優惠"
            }」折抵 NT$ ${discountAmount.toLocaleString()}`
          : "";

      transaction.set(
        notificationRef,
        {
          userId,

          requestId,

          type:
            "package_purchase",

          title:
            "課卡購買完成",

          body:
            `已完成 ${packageName} 的購買${discountText}，增加 ${packagePoints} 點。目前共有 ${newPointBalance} 點。`,

          packageId,
          packageName,

          pointsAdded:
            packagePoints,

          finalPrice,

          isRead: false,

          createdAt:
            serverTimestamp(),
        }
      );

      return {
        packageName,
        packagePoints,
        newPointBalance,
        finalPrice,
        discountAmount,
        couponName,
        couponSource,
      };
    }
  );
}

export async function rejectPurchaseRequest({
  requestId,
  adminId,
  reason = "",
}: RejectPurchaseRequestParams) {
  const requestRef = doc(
    db,
    "purchaseRequests",
    requestId
  );

  const adminRef = doc(
    db,
    "users",
    adminId
  );

  return runTransaction(
    db,
    async (transaction) => {
      // =========================
      // 1. 讀取購買申請
      // =========================

      const requestSnapshot =
        await transaction.get(
          requestRef
        );

      // =========================
      // 2. 讀取管理員
      // =========================

      const adminSnapshot =
        await transaction.get(
          adminRef
        );

      if (
        !adminSnapshot.exists()
      ) {
        throw new Error(
          "找不到管理員資料"
        );
      }

      if (
        adminSnapshot.data().role !==
        "admin"
      ) {
        throw new Error(
          "你沒有管理員權限"
        );
      }

      if (
        !requestSnapshot.exists()
      ) {
        throw new Error(
          "找不到購買申請"
        );
      }

      const requestData =
        requestSnapshot.data();

      if (
        requestData.status !==
        "pending"
      ) {
        throw new Error(
          "此筆申請目前無法拒絕"
        );
      }

      const userId = String(
        requestData.userId ?? ""
      );

      // =========================
      // 3. 更新購買申請
      // =========================

      transaction.update(
        requestRef,
        {
          status: "rejected",

          paymentStatus:
            "unpaid",

          reviewedBy:
            adminId,

          reviewedAt:
            serverTimestamp(),

          rejectionReason:
            reason.trim(),
        }
      );

      // =========================
      // 4. 通知會員
      // =========================

      if (userId) {
        const notificationRef =
          doc(
            db,
            "notifications",
            `request_${requestId}_rejected`
          );

        transaction.set(
          notificationRef,
          {
            userId,

            requestId,

            type:
              "purchase_rejected",

            title:
              "課卡購買申請未通過",

            body:
              reason.trim()
                ? `購買申請未通過：${reason.trim()}`
                : "你的課卡購買申請未通過，如有疑問請聯絡老師。",

            isRead: false,

            createdAt:
              serverTimestamp(),
          }
        );
      }

      return {
        requestId,
      };
    }
  );
}
