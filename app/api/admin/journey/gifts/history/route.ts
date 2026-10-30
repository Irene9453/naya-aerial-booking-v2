
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type MilestoneLevel = 100 | 300 | 500;

type GiftStatus =
  | "not_claimed"
  | "notified"
  | "claimed";

function isMilestoneLevel(
  value: number
): value is MilestoneLevel {
  return value === 100 || value === 300 || value === 500;
}

function normalizeStatus(value: unknown): GiftStatus {
  if (
    value === "notified" ||
    value === "claimed"
  ) {
    return value;
  }

  return "not_claimed";
}

async function verifyAdmin(
  request: NextRequest
): Promise<boolean> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(
      authorization.slice(7)
    );

    const userSnapshot = await adminDb
      .collection("users")
      .doc(decoded.uid)
      .get();

    return (
      userSnapshot.exists &&
      userSnapshot.data()?.role === "admin"
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(request);

    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "沒有管理員權限。",
        },
        { status: 403 }
      );
    }

    const userId = request.nextUrl.searchParams
      .get("userId")
      ?.trim();

    const milestoneClasses = Number(
      request.nextUrl.searchParams.get(
        "milestoneClasses"
      )
    );

    if (
      !userId ||
      userId.includes("/") ||
      !isMilestoneLevel(milestoneClasses)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "會員或里程碑資料不正確。",
        },
        { status: 400 }
      );
    }

    const giftRef = adminDb
      .collection("journeyGifts")
      .doc(`${userId}_${milestoneClasses}`);

    const historySnapshot = await giftRef
      .collection("history")
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();

    const history = historySnapshot.docs.map(
      (historyDocument) => {
        const data = historyDocument.data();

        const timestamp = data.updatedAt;

        const updatedAt =
          timestamp &&
          typeof timestamp.toDate === "function"
            ? timestamp.toDate().toISOString()
            : null;

        return {
          id: historyDocument.id,
          previousStatus: normalizeStatus(
            data.previousStatus
          ),
          newStatus: normalizeStatus(
            data.newStatus
          ),
          previousClaimedAt:
            typeof data.previousClaimedAt === "string"
              ? data.previousClaimedAt
              : null,
          claimedAt:
            typeof data.claimedAt === "string"
              ? data.claimedAt
              : null,
          updatedBy:
            typeof data.updatedBy === "string"
              ? data.updatedBy
              : "",
          updatedAt,
        };
      }
    );

    // 將管理員 UID 對應為顯示名稱
    const adminIds = [
      ...new Set(
        history
          .map((item) => item.updatedBy)
          .filter(Boolean)
      ),
    ];

    const adminEntries = await Promise.all(
      adminIds.map(async (adminId) => {
        const adminSnapshot = await adminDb
          .collection("users")
          .doc(adminId)
          .get();

        const data = adminSnapshot.data();

        const displayName =
          String(data?.name ?? "").trim() ||
          String(data?.nickname ?? "").trim() ||
          String(data?.email ?? "").trim() ||
          adminId;

        return [adminId, displayName] as const;
      })
    );

    const adminNameMap = new Map(adminEntries);

    return NextResponse.json({
      success: true,
      userId,
      milestoneClasses,
      history: history.map((item) => ({
        ...item,
        updatedByName:
          adminNameMap.get(item.updatedBy) ||
          item.updatedBy ||
          "未知管理員",
      })),
    });
  } catch (error) {
    console.error(
      "查詢實體禮物操作歷程失敗：",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "查詢操作歷程失敗，請稍後再試。",
      },
      { status: 500 }
    );
  }
}
