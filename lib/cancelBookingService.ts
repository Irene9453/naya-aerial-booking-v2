
import { auth } from "@/lib/firebase";

type CancelBookingParams = {
  userId: string;
  bookingId: string;
  classId: string;
};

export async function cancelBooking({
  userId,
  bookingId,
  classId,
}: CancelBookingParams) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入會員");
  }

  if (currentUser.uid !== userId) {
    throw new Error("會員身分不符");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch(
    "/api/bookings/cancel",
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? "取消預約失敗，請稍後再試"
    );
  }

  if (data.waitlistNotificationWarning) {
    console.warn(
      "取消及退點成功，但候補通知未完成，請檢查伺服器紀錄。"
    );
  }

  return {
    refundedPoints: data.refundedPoints as number,
    newPointBalance: data.newPointBalance as number,
    cancellationDeadline: new Date(
      data.cancellationDeadline
    ),
  };
}
