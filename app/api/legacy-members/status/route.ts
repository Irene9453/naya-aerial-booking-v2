import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "請先登入會員。" },
        { status: 401 }
      );
    }

    const idToken = authorization.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const userSnapshot = await adminDb
      .collection("users")
      .doc(uid)
      .get();

    if (!userSnapshot.exists) {
      return NextResponse.json(
        { error: "找不到會員資料。" },
        { status: 404 }
      );
    }

    const userData = userSnapshot.data() ?? {};

    if (
      userData.legacyMemberId ||
      userData.legacyClaimedAt ||
      userData.legacyStatus === "claimed"
    ) {
      return NextResponse.json({ status: "approved" });
    }

    const claimSnapshot = await adminDb
      .collection("legacyClaimRequests")
      .doc(uid)
      .get();

    if (!claimSnapshot.exists) {
      return NextResponse.json({ status: "none" });
    }

    const status = claimSnapshot.data()?.status;

    if (
      status === "pending" ||
      status === "approved" ||
      status === "rejected"
    ) {
      return NextResponse.json({ status });
    }

    return NextResponse.json({ status: "none" });
  } catch (error) {
    console.error("讀取舊會員認領狀態失敗：", error);

    return NextResponse.json(
      { error: "無法取得認領狀態，請稍後再試。" },
      { status: 500 }
    );
  }
}