import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7).trim(), true);
    const authUser = await adminAuth.getUser(decoded.uid);
    if (!authUser.emailVerified || !authUser.email || authUser.disabled) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    const profile = adminDb.collection("users").doc(decoded.uid);
    const snapshot = await profile.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }
    if (snapshot.get("email") !== authUser.email) {
      await profile.update({ email: authUser.email });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Naya Sync Email] Failed:", error);
    return NextResponse.json({ error: "SYNC_FAILED" }, { status: 401 });
  }
}