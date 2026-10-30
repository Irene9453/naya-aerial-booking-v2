import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
async function requireAdmin(request: NextRequest) { const h=request.headers.get("authorization"); if(!h?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED"); const d=await adminAuth.verifyIdToken(h.slice(7)); const u=await adminDb.collection("users").doc(d.uid).get(); if(!u.exists||u.data()?.role!=="admin") throw new Error("FORBIDDEN"); }
export async function POST(request: NextRequest) {
  try { await requireAdmin(request); const body=await request.json(); const id=String(body.legacyMemberId??"").trim(); if(!id) return NextResponse.json({error:"缺少舊會員資料。"},{status:400}); const ref=adminDb.collection("legacyMembers").doc(id); await adminDb.runTransaction(async tx=>{ const snap=await tx.get(ref); if(!snap.exists) throw new Error("NOT_FOUND"); if(snap.data()?.status!=="unclaimed") throw new Error("LOCKED"); tx.delete(ref); }); return NextResponse.json({success:true}); }
  catch(error){ const m=error instanceof Error?error.message:""; const map:Record<string,[string,number]>={UNAUTHORIZED:["請先登入管理員帳號。",401],FORBIDDEN:["只有管理員可以刪除資料。",403],NOT_FOUND:["找不到舊會員資料。",404],LOCKED:["已認領會員不可刪除。",409]}; const hit=map[m]; console.error("刪除舊會員失敗：",error); return NextResponse.json({error:hit?.[0]??"刪除失敗。"},{status:hit?.[1]??500}); }
}
