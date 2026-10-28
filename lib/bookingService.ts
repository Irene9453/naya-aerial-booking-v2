import { auth } from "@/lib/firebase";

type BookClassParams = {
  userId: string;
  classId: string;
};

export async function bookClass({
  userId,
  classId,
}: BookClassParams) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入會員");
  }

  if (currentUser.uid !== userId) {
    throw new Error("會員身分不符，請重新登入");
  }

  const idToken = await currentUser.getIdToken();

  const response = await fetch("/api/bookings/book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      classId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? "預約失敗，請稍後再試"
    );
  }

  return {
    bookingId: data.bookingId as string,
    remainingPoints: data.remainingPoints as number,
  };
}