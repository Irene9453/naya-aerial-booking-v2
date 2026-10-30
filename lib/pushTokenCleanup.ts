
import { deleteDoc, doc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deletePushToken } from "@/lib/firebaseMessaging";

const DEVICE_ID_KEY = "naya-push-device-id";

/**
 * 登出前清理目前會員的推播 Token。
 * Firestore 刪除是必要步驟；瀏覽器 FCM Token
 * 清理失敗時，保留錯誤紀錄，但不阻止登出。
 */
export async function cleanupCurrentUserPushToken(): Promise<void> {
  if (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
  ) {
    return;
  }

  const user = auth.currentUser;

  if (!user) {
    return;
  }

  const deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // 無法定位 Firestore 文件，不可直接假設已清理。
    throw new Error(
      "找不到裝置 ID，無法確認 Firestore 推播 Token 是否已清除。"
    );
  }

  const tokenRef = doc(
    db,
    "users",
    user.uid,
    "pushTokens",
    deviceId
  );

  // 必須先刪除 Firestore 紀錄。
  // 若此步驟失敗，保留錯誤並阻止登出。
  await deleteDoc(tokenRef);

  // Firestore 紀錄已刪除，後端不應再透過此文件取得 Token。
  // FCM 本機清理失敗不應阻止會員登出。
  try {
    await deletePushToken();
  } catch (error) {
    console.warn(
      "[Naya Push] FCM token cleanup failed after Firestore deletion:",
      error
    );
  }
}
