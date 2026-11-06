import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  }
  let adminId: string;
  try {
    adminId = (await adminAuth.verifyIdToken(authHeader.slice(7), true)).uid;
  } catch {
    return NextResponse.json({ error: "登入已失效，請重新登入。" }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式不正確。" }, { status: 400 });
  }
  const studentId = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>).studentId : undefined;
  if (typeof studentId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
    return NextResponse.json({ error: "學生編號不正確。" }, { status: 400 });
  }

  try {
    const [admin, student] = await Promise.all([
      adminDb.collection("users").doc(adminId).get(),
      adminDb.collection("users").doc(studentId).get(),
    ]);
    if (!admin.exists || admin.data()?.role !== "admin") {
      return NextResponse.json({ error: "沒有管理員操作權限。" }, { status: 403 });
    }
    if (!student.exists || student.data()?.role !== "student") {
      return NextResponse.json({ error: "找不到學生會員。" }, { status: 404 });
    }

    // Do not infer balance from purchase flags: check authoritative voucher records.
    const ids = ["trial_yoga", "trial_aerial"] as const;
    const snapshots = await Promise.all(ids.map(offerId =>
      adminDb.collection("trialVouchers")
        .doc(`new_student_${studentId}_${offerId}`).get()
    ));
    const counts = ids.map((offerId, i) => {
      const data = snapshots[i].data();
      const expectedKind = offerId === "trial_yoga" ? "yoga" : "aerial";
      return snapshots[i].exists &&
        data?.userId === studentId &&
        data?.offerId === offerId &&
        data?.kind === expectedKind &&
        data?.status === "available" &&
        data?.quantity === 1 &&
        data?.bookingId == null ? 1 : 0;
    });
    return NextResponse.json({
      trialYoga: counts[0],
      trialAerial: counts[1],
      total: counts[0] + counts[1],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("管理員讀取體驗券額度失敗", error);
    return NextResponse.json({ error: "查詢體驗券失敗，請稍後再試。" }, { status: 500 });
  }
}
