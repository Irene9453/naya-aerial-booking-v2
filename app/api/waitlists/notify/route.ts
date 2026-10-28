import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  adminAuth,
  adminDb,
} from "@/lib/firebaseAdmin";

export async function POST(
  request: NextRequest
) {
  try {
    // =========================
    // 1. 驗證登入會員
    // =========================
    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return NextResponse.json(
        {
          error: "未登入",
        },
        {
          status: 401,
        }
      );
    }

    const idToken =
      authorization.replace(
        "Bearer ",
        ""
      );

    const decodedToken =
      await adminAuth.verifyIdToken(
        idToken
      );

    const requesterUid =
      decodedToken.uid;

    // =========================
    // 2. 取得 classId
    // =========================
    const body =
      await request.json();

    const classId =
      String(body.classId ?? "");

    if (!classId) {
      return NextResponse.json(
        {
          error: "缺少 classId",
        },
        {
          status: 400,
        }
      );
    }

    // =========================
    // 3. 取得課程
    // =========================
    const classRef =
      adminDb
        .collection("classes")
        .doc(classId);

    const classSnapshot =
      await classRef.get();

    if (!classSnapshot.exists) {
      return NextResponse.json(
        {
          error: "找不到課程資料",
        },
        {
          status: 404,
        }
      );
    }

    const classData =
      classSnapshot.data();

    if (!classData) {
      return NextResponse.json(
        {
          error: "課程資料不完整",
        },
        {
          status: 400,
        }
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

    // 沒有空位，就不需要通知
    if (
      capacity <= 0 ||
      bookedCount >= capacity
    ) {
      return NextResponse.json({
        success: true,
        notifiedCount: 0,
        message:
          "目前沒有釋出名額，不發送候補通知。",
      });
    }

    // =========================
    // 4. 安全檢查
    //
    // 一般會員只能在「自己剛取消
    // 這堂課」後觸發候補通知。
    // Admin 則可以直接觸發。
    // =========================
    const requesterSnapshot =
      await adminDb
        .collection("users")
        .doc(requesterUid)
        .get();

    const requesterData =
      requesterSnapshot.data();

    const isAdmin =
      requesterData?.role === "admin";

    if (!isAdmin) {
      const requesterBookingId =
        `${requesterUid}_${classId}`;

      const requesterBookingSnapshot =
        await adminDb
          .collection("bookings")
          .doc(requesterBookingId)
          .get();

      if (
        !requesterBookingSnapshot.exists
      ) {
        return NextResponse.json(
          {
            error:
              "你無權觸發此課程的候補通知",
          },
          {
            status: 403,
          }
        );
      }

      const requesterBooking =
        requesterBookingSnapshot.data();

      const allowedStatuses = [
        "cancelled",
        "special_leave",
        "admin_cancelled",
      ];

      if (
        !allowedStatuses.includes(
          String(
            requesterBooking?.status ??
              ""
          )
        )
      ) {
        return NextResponse.json(
          {
            error:
              "目前沒有可驗證的名額釋出紀錄",
          },
          {
            status: 403,
          }
        );
      }
    }

    // =========================
    // 5. 找出所有 waiting 候補者
    // =========================
    const waitlistSnapshot =
      await adminDb
        .collection("waitlists")
        .where(
          "classId",
          "==",
          classId
        )
        .where(
          "status",
          "==",
          "waiting"
        )
        .get();

    if (waitlistSnapshot.empty) {
      return NextResponse.json({
        success: true,
        notifiedCount: 0,
        message:
          "目前沒有候補會員。",
      });
    }

    // =========================
    // 6. 建立通知
    // =========================
    const batch =
      adminDb.batch();

    let notifiedCount = 0;

    for (
      const waitlistDoc
      of waitlistSnapshot.docs
    ) {
      const waitlistData =
        waitlistDoc.data();

      const userId =
        String(
          waitlistData.userId ?? ""
        );

      if (!userId) {
        continue;
      }

      const notificationRef =
        adminDb
          .collection(
            "notifications"
          )
          .doc();

      batch.set(
        notificationRef,
        {
          userId,

          type:
            "waitlist_available",

          title:
            "候補課程有名額了",

          body:
            `${String(
              classData.courseName ??
                "候補課程"
            )} 已釋出名額，請回到預約頁查看。名額以實際完成預約者為準。`,

          classId,

          courseName:
            String(
              classData.courseName ??
                ""
            ),

          classStartTime:
            classData.startTime,

          waitlistId:
            waitlistDoc.id,

          isRead: false,

          createdAt:
            FieldValue.serverTimestamp(),
        }
      );

      batch.update(
        waitlistDoc.ref,
        {
          lastNotifiedAt:
            FieldValue.serverTimestamp(),
        }
      );

      notifiedCount++;
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      notifiedCount,
      message:
        `已通知 ${notifiedCount} 位候補會員。`,
    });
  } catch (error) {
    console.error(
      "候補通知失敗：",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "候補通知失敗",
      },
      {
        status: 500,
      }
    );
  }
}