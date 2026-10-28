
import { auth } from "@/lib/firebase";

export type AttendanceStatus =
  | "present"
  | "absent"
  | null;

type UpdateAttendanceParams = {
  bookingId: string;
  status: AttendanceStatus;
};

export type AttendanceRewardResult = {
  status: AttendanceStatus;
  rewardChange: number;
  newRewardBalance: number;
};

export async function updateAttendanceWithReward({
  bookingId,
  status,
}: UpdateAttendanceParams): Promise<AttendanceRewardResult> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入管理員帳號");
  }

  const idToken = await currentUser.getIdToken();

  let response: Response;

  try {
    response = await fetch("/api/admin/attendance/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        bookingId,
        status,
      }),
    });
  } catch {
    throw new Error(
      "網路連線失敗，請先重新確認點名及紅利紀錄。"
    );
  }

  const responseText = await response.text();

  let data: {
    error?: string;
    status?: AttendanceStatus;
    rewardChange?: number;
    newRewardBalance?: number;
  };

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `點名 API 回傳格式不正確（HTTP ${response.status}）。`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error ?? "更新點名狀態失敗"
    );
  }

  if (
    data.status !== status ||
    typeof data.rewardChange !== "number" ||
    typeof data.newRewardBalance !== "number"
  ) {
    throw new Error(
      "點名結果資料不完整，請重新確認點名紀錄。"
    );
  }

  return {
    status: data.status,
    rewardChange: data.rewardChange,
    newRewardBalance: data.newRewardBalance,
  };
}
