import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type JoinWaitlistParams = {
  userId: string;
  classId: string;
};

type CancelWaitlistParams = {
  userId: string;
  classId: string;
};

export async function joinWaitlist({
  userId,
  classId,
}: JoinWaitlistParams) {
  const userRef = doc(
    db,
    "users",
    userId
  );

  const classRef = doc(
    db,
    "classes",
    classId
  );

  const waitlistId =
    `${userId}_${classId}`;

  const waitlistRef = doc(
    db,
    "waitlists",
    waitlistId
  );

  const bookingRef = doc(
    db,
    "bookings",
    `${userId}_${classId}`
  );

  return runTransaction(
    db,
    async (transaction) => {
      const userSnapshot =
        await transaction.get(
          userRef
        );

      const classSnapshot =
        await transaction.get(
          classRef
        );

      const bookingSnapshot =
        await transaction.get(
          bookingRef
        );

      const waitlistSnapshot =
        await transaction.get(
          waitlistRef
        );

      if (!userSnapshot.exists()) {
        throw new Error(
          "找不到會員資料"
        );
      }

      if (!classSnapshot.exists()) {
        throw new Error(
          "找不到課程資料"
        );
      }

      const classData =
        classSnapshot.data();

      if (
        !(
          classData.startTime instanceof
          Timestamp
        )
      ) {
        throw new Error(
          "課程時間設定不正確"
        );
      }

      if (
        classData.startTime.toMillis() <=
        Date.now()
      ) {
        throw new Error(
          "課程已開始，無法加入候補"
        );
      }

      if (
        String(
          classData.status ?? ""
        ) !== "open"
      ) {
        throw new Error(
          "這堂課目前無法候補"
        );
      }

      const bookedCount =
        Number(
          classData.bookedCount ?? 0
        );

      const capacity =
        Number(
          classData.capacity ?? 0
        );

      if (
        capacity <= 0
      ) {
        throw new Error(
          "課程名額設定不正確"
        );
      }

      /*
       * 只有真正滿班時
       * 才能加入候補。
       */
      if (
        bookedCount < capacity
      ) {
        throw new Error(
          "目前已有名額，可以直接預約。"
        );
      }

      if (
        bookingSnapshot.exists() &&
        bookingSnapshot.data()
          .status === "booked"
      ) {
        throw new Error(
          "你已經預約這堂課"
        );
      }

      if (
        waitlistSnapshot.exists() &&
        waitlistSnapshot.data()
          .status === "waiting"
      ) {
        throw new Error(
          "你已經在候補名單中"
        );
      }

      transaction.set(
        waitlistRef,
        {
          userId,
          classId,

          courseName: String(
            classData.courseName ??
              ""
          ),

          classStartTime:
            classData.startTime,

          status: "waiting",

          createdAt:
            serverTimestamp(),

          cancelledAt: null,
          convertedAt: null,
          lastNotifiedAt: null,
        }
      );

      return {
        waitlistId,
      };
    }
  );
}

export async function cancelWaitlist({
  userId,
  classId,
}: CancelWaitlistParams) {
  const waitlistRef = doc(
    db,
    "waitlists",
    `${userId}_${classId}`
  );

  return runTransaction(
    db,
    async (transaction) => {
      const waitlistSnapshot =
        await transaction.get(
          waitlistRef
        );

      if (
        !waitlistSnapshot.exists()
      ) {
        throw new Error(
          "找不到候補紀錄"
        );
      }

      const waitlistData =
        waitlistSnapshot.data();

      if (
        waitlistData.userId !==
        userId
      ) {
        throw new Error(
          "你無權取消此候補"
        );
      }

      if (
        waitlistData.status !==
        "waiting"
      ) {
        throw new Error(
          "這筆候補目前無法取消"
        );
      }

      transaction.update(
        waitlistRef,
        {
          status: "cancelled",
          cancelledAt:
            serverTimestamp(),
        }
      );

      return {
        success: true,
      };
    }
  );
}