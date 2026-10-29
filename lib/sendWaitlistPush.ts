import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "@/lib/firebaseAdmin";

type PushResult = {
  sent: number;
  failed: number;
  skipped: boolean;
};

/**
 * 發送候補名額釋出推播。
 *
 * 安全限制：
 * 1. Emulator 模式不發送真實 FCM。
 * 2. 只讀取指定會員的 pushTokens。
 * 3. 不修改會員點數、預約或候補資料。
 */
export async function sendWaitlistPush(
  userId: string,
  courseName: string
): Promise<PushResult> {
  // 安全鎖：尚未完成測試前，一律禁止發送正式 FCM。
  // 目前不提供環境變數解除此限制。
  return {
    sent: 0,
    failed: 0,
    skipped: true,
  };
  if (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
  ) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
    };
  }

  if (!userId) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
    };
  }

  const tokenSnapshot = await adminDb
    .collection("users")
    .doc(userId)
    .collection("pushTokens")
    .get();

  if (tokenSnapshot.empty) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
    };
  }

  let sent = 0;
  let failed = 0;

  for (const tokenDoc of tokenSnapshot.docs) {
    const token = tokenDoc.data().token;

    if (typeof token !== "string" || !token) {
      continue;
    }

    try {
      await getMessaging().send({
        token,
        notification: {
          title: "候補課程有名額了 🔔",
          body: `${courseName} 已釋出名額，快回來查看！`,
        },
        webpush: {
          fcmOptions: {
            link: "/member",
          },
        },
      });

      sent++;
    } catch (error) {
      failed++;
      console.error(
        "[Naya Push] Failed to send:",
        error
      );
    }
  }

  return {
    sent,
    failed,
    skipped: false,
  };
}