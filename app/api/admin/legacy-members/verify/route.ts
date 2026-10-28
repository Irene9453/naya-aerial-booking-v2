import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminDb,
  adminAuth,
} from "@/lib/firebaseAdmin";

function normalizePhone(
  value: string
) {
  return value.replace(/\D/g, "");
}

export async function POST(
  request: NextRequest
) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入管理員帳號。" },
        { status: 401 }
      );
    }

    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    const adminSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!adminSnapshot.exists || adminSnapshot.data()?.role !== "admin") {
      return NextResponse.json(
        { error: "沒有管理員權限。" },
        { status: 403 }
      );
    }

    const body =
      await request.json();

    const phone =
      normalizePhone(
        String(
          body.phone ?? ""
        )
      );

    const birthdayYear =
      Number(
        body.birthdayYear
      );

    const birthdayMonth =
      Number(
        body.birthdayMonth
      );

    const birthdayDay =
      Number(
        body.birthdayDay
      );

    if (
      !/^09\d{8}$/.test(phone)
    ) {
      return NextResponse.json(
        {
          error:
            "手機號碼格式不正確。",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(
        birthdayMonth
      ) ||
      birthdayMonth < 1 ||
      birthdayMonth > 12 ||
      !Number.isInteger(
        birthdayDay
      ) ||
      birthdayDay < 1 ||
      birthdayDay > 31
    ) {
      return NextResponse.json(
        {
          error:
            "生日資料不正確。",
        },
        {
          status: 400,
        }
      );
    }

    let legacyQuery =
      adminDb
        .collection(
          "legacyMembers"
        )
        .where(
          "phoneNormalized",
          "==",
          phone
        )
        .where(
          "birthdayMonth",
          "==",
          birthdayMonth
        )
        .where(
          "birthdayDay",
          "==",
          birthdayDay
        )
        .where(
          "status",
          "==",
          "unclaimed"
        );

    if (
      Number.isInteger(
        birthdayYear
      ) &&
      birthdayYear > 0
    ) {
      legacyQuery =
        legacyQuery.where(
          "birthdayYear",
          "==",
          birthdayYear
        );
    }

    const snapshot =
      await legacyQuery.get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          error:
            "找不到符合的舊會員資料，請確認手機與生日是否與舊系統登記資料相同。",
        },
        {
          status: 404,
        }
      );
    }

    if (
      snapshot.size > 1
    ) {
      return NextResponse.json(
        {
          error:
            "找到多筆相同資料，請聯繫老師協助確認。",
        },
        {
          status: 409,
        }
      );
    }

    const document =
      snapshot.docs[0];

    const data =
      document.data();

    return NextResponse.json({
      success: true,

      legacyMemberId:
        document.id,

      name:
        String(
          data.name ?? ""
        ),

      points:
        Number(
          data.points ?? 0
        ),

      rewardPoints:
        Number(
          data.rewardPoints ?? 0
        ),
    });
  } catch (error: unknown) {
    console.error(
      "驗證舊會員失敗：",
      error
    );

    return NextResponse.json(
      {
        error:
          "驗證舊會員資料失敗，請稍後再試。",
      },
      {
        status: 500,
      }
    );
  }
}