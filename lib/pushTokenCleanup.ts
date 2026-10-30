import {
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deletePushToken } from "@/lib/firebaseMessaging";

/**
 * 登出前清除目前會員所有已登記的推播 Token。
 *
 * 即使裝置 ID 遺失，也能清除 Firestore 推播紀錄。
 * 其他裝置需要重新開啟推播，但會員資料不受影響。
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

  // 只查詢目前登入會員自己的推播紀錄
  const tokensRef = collection(
    db,
    "users",
    user.uid,
    "pushTokens"
  );

  const snapshot = await getDocs(tokensRef);

  // 批次刪除目前會員的推播紀錄
  if (!snapshot.empty) {
    const batch = writeBatch(db);

    snapshot.docs.forEach((tokenDoc) => {
      batch.delete(tokenDoc.ref);
    });

    await batch.commit();
  }

  // Firestore 清理成功後，嘗試清除本機 FCM Token
  try {
    await deletePushToken();
  } catch (error) {
    console.warn(
      "[Naya Push] Local FCM token cleanup failed:",
      error
    );
  }
}
