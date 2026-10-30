
import { NextRequest, NextResponse } from "next/server";
import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";
import { sendWaitlistPush } from "@/lib/sendWaitlistPush";

export const runtime = "nodejs";

function getCancellationDeadline(
  classStartTime: Timestamp
) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(classStartTime.toDate());

  const year = dateParts.find(
    (part) => part.type === "year"
  )?.value;

  const month = dateParts.find(
    (part) => part.type === "month"
  )?.value;

  const day = dateParts.find(
    (part) => part.type === "day"
  )?.value;

  if (!year || !month || !day) {
    throw new Error("無法計算取消期限");
  }

  const classDayStart = new Date(
    `${year}-${month}-${day}T00:00:00+08:00`
  );

  return new Date(classDayStart.getTime() - 1);
}

export async function POST(request: NextRequest) {
  try {
    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入會員" },
        { status: 401 }
      );
    }

    const idToken = authorization.slice(7);

    const decodedToken =
      await adminAuth.verifyIdToken(idToken);

    // 會員身分由 Firebase Auth 決定
    const userId = decodedToken.uid;

    const body = await request.json();

    const bookingId = body?.bookingId;
    const classId = body?.classId;

    if (
      typeof bookingId !== "string" ||
      typeof classId !== "string" ||
      !classId.trim() ||
      bookingId !== `${userId}_${classId}` ||
      classId.includes("/")
    ) {
      return NextResponse.json(
        { error: "預約資料不正確" },
        { status: 400 }
      );
    }

    const userRef = adminDb
      .collection("users")
      .doc(userId);

    const classRef = adminDb
      .collection("classes")
      .doc(classId);

    const bookingRef = adminDb
      .collection("bookings")
      .doc(bookingId);

    const result = await adminDb.runTransaction(
      async (tx) => {
        const userSnap = await tx.get(userRef);
        const classSnap = await tx.get(classRef);
        const bookingSnap = await tx.get(bookingRef);

        if (!userSnap.exists) {
          throw new Error("找不到會員資料");
        }

        if (!classSnap.exists) {
          throw new Error("找不到課程資料");
        }

        if (!bookingSnap.exists) {
          throw new Error("找不到預約紀錄");
        }

        const userData = userSnap.data()!;
        const classData = classSnap.data()!;
        const bookingData = bookingSnap.data()!;

        if (
          bookingData.userId !== userId ||
          bookingData.classId !== classId
        ) {
          throw new Error("你無權取消此預約");
        }

        if (bookingData.status !== "booked") {
          throw new Error("這筆預約已取消或無法取消");
        }

        if (!(classData.startTime instanceof Timestamp)) {
          throw new Error("課程時間設定不正確");
        }

        const cancellationDeadline =
          getCancellationDeadline(classData.startTime);

        if (Date.now() > cancellationDeadline.getTime()) {
          throw new Error(
            "已超過取消期限。課程最晚須於上課前一天 23:59 前取消。"
          );
        }

        const pointsUsed = Number(
          bookingData.pointsUsed ?? 0
        );

        const currentPoints = Number(
          userData.points ?? 0
        );

        const bookedCount = Number(
          classData.bookedCount ?? 0
        );

        if (
          !Number.isFinite(pointsUsed) ||
          pointsUsed <= 0 ||
          !Number.isFinite(currentPoints)
        ) {
          throw new Error("預約點數資料不正確");
        }

        if (
          !Number.isInteger(bookedCount) ||
          bookedCount <= 0
        ) {
          throw new Error("課程預約人數資料異常");
        }

        const newPointBalance =
          currentPoints + pointsUsed;

        const newBookedCount = bookedCount - 1;

        const refundRef = adminDb
          .collection("pointTransactions")
          .doc();

        const notificationRef = adminDb
          .collection("notifications")
          .doc();

        tx.update(userRef, {
          points: newPointBalance,
        });

        tx.update(classRef, {
          bookedCount: newBookedCount,
        });

        tx.update(bookingRef, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          pointsRefunded: pointsUsed,
        });

        tx.create(refundRef, {
          userId,
          bookingId,
          classId,
          courseName: String(
            bookingData.courseName ?? ""
          ),
          classStartTime: classData.startTime,
          type: "cancellation_refund",
          amount: pointsUsed,
          balanceAfter: newPointBalance,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.create(notificationRef, {
          userId,
          type: "cancellation",
          title: "預約已取消",
          body: `已取消 ${String(
            bookingData.courseName ?? ""
          )}，並退回 ${pointsUsed} 點`,
          classId,
          bookingId,
          courseName: String(
            bookingData.courseName ?? ""
          ),
          classStartTime: classData.startTime,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          refundedPoints: pointsUsed,
          newPointBalance,
          cancellationDeadline:
            cancellationDeadline.toISOString(),
        };
      }
    );

    // 取消交易完成後，再通知候補會員。
    // 通知失敗不影響已完成的退點。
    let waitlistNotificationWarning = false;

    try {
      const classSnap = await classRef.get();
      const latestClass = classSnap.data();

      if (
        latestClass &&
        Number(latestClass.bookedCount ?? 0) <
          Number(latestClass.capacity ?? 0) &&
        latestClass.startTime instanceof Timestamp &&
        latestClass.startTime.toMillis() > Date.now()
      ) {
        const waitlistSnap = await adminDb
          .collection("waitlists")
          .where("classId", "==", classId)
          .get();

        const waitingDocs = waitlistSnap.docs.filter(
          (doc) => doc.data().status === "waiting"
        );

        // 分批處理，避免超過 Firestore batch 限制
        for (let i = 0; i < waitingDocs.length; i += 200) {
          const batch = adminDb.batch();

          for (const waitlistDoc of waitingDocs.slice(
            i,
            i + 200
          )) {
            const waitlistData = waitlistDoc.data();

            const noticeRef = adminDb
              .collection("notifications")
              .doc();

            batch.create(noticeRef, {
              userId: waitlistData.userId,
              type: "waitlist_available",
              title: "候補課程有名額了",
              body: `${String(
                latestClass.courseName ?? ""
              )} 已釋出名額，請回到預約頁查看。名額以實際完成預約者為準。`,
              classId,
              bookingId: null,
              courseName: String(
                latestClass.courseName ?? ""
              ),
              classStartTime: latestClass.startTime,
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
            });

            batch.update(waitlistDoc.ref, {
              lastNotifiedAt:
                FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
// 候補通知建立成功後，觸發推播。
// 目前 FCM 安全鎖啟用，不會實際發送。
for (const waitlistDoc of waitingDocs.slice(i, i + 200)) {
  const waitlistUserId = waitlistDoc.data().userId;

  if (typeof waitlistUserId !== "string" || !waitlistUserId) {
    continue;
  }

  try {
    await sendWaitlistPush(
      waitlistUserId,
      String(latestClass.courseName ?? "候補課程")
    );
  } catch (pushError) {
    console.error(
      "[Naya Push] 候補推播失敗：",
      pushError
    );
  }
}
        }
      }
    } catch (notificationError) {
      waitlistNotificationWarning = true;
      console.error(
        "取消成功，但候補通知失敗：",
        notificationError
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
      waitlistNotificationWarning,
    });
  } catch (error) {
    console.error("一般取消 API 錯誤：", error);

    const message =
      error instanceof Error
        ? error.message
        : "取消預約失敗";

    const knownErrors = [
      "找不到會員資料",
      "找不到課程資料",
      "找不到預約紀錄",
      "你無權取消此預約",
      "這筆預約已取消或無法取消",
      "課程時間設定不正確",
      "無法計算取消期限",
      "已超過取消期限。課程最晚須於上課前一天 23:59 前取消。",
      "預約點數資料不正確",
      "課程預約人數資料異常",
    ];

    return NextResponse.json(
      {
        error: knownErrors.includes(message)
          ? message
          : "取消處理失敗，請稍後再試",
      },
      {
        status: knownErrors.includes(message)
          ? 400
          : 500,
      }
    );
  }
}
