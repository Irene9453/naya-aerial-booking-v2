import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Emulator 測試模式不提供正式 Firebase 推播設定
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    return NextResponse.json(
      { error: "Push notifications are disabled in emulator mode." },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 僅使用 Firebase Web App 的公開設定
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // 設定不完整時停止
  if (
    !config.apiKey ||
    !config.authDomain ||
    !config.projectId ||
    !config.messagingSenderId ||
    !config.appId
  ) {
    return NextResponse.json(
      { error: "Firebase configuration is incomplete." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}