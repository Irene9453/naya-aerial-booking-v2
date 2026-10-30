import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "舊會員管理員新增功能尚未開放。",
    },
    { status: 501 }
  );
}