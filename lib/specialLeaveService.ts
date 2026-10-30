
import { auth } from "@/lib/firebase";

type UseSpecialLeaveParams = {
  userId: string;
  bookingId: string;
  classId: string;
};

export async function useSpecialLeave({
  userId,
  bookingId,
  classId,
}: UseSpecialLeaveParams) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入會員");
  }

  if (currentUser.uid !== userId) {
    throw new Error("會員身分不符");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(
    "/api/bookings/special-leave",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        bookingId,
        classId,
      }),
    }
  );

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "特殊請假 API 回傳格式不正確，請確認 API 檔案位置。"
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? "特殊請假失敗，請稍後再試"
    );
  }

  if (data.waitlistNotificationWarning) {
    console.warn(
      "特殊請假及退點成功，但候補通知未完成，請檢查伺服器紀錄。"
    );
  }

  return {
    refundedPoints: data.refundedPoints as number,
    newPointBalance: data.newPointBalance as number,
    periodYear: data.periodYear as number,
    periodHalf: data.periodHalf as number,
    periodKey: data.periodKey as string,
  };
}
