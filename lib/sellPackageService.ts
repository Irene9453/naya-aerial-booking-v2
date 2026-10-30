
import { auth } from "@/lib/firebase";

type SellPackageParams = {
  adminId: string;
  studentId: string;
  packageId: string;
  operationId: string;
};

export async function sellPackage({
  adminId,
  studentId,
  packageId,
  operationId,
}: SellPackageParams) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("請先登入管理員帳號");
  }

  if (currentUser.uid !== adminId) {
    throw new Error("管理員身分不符");
  }

  const idToken = await currentUser.getIdToken();

  let response: Response;

  try {
    response = await fetch("/api/admin/packages/sell", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        studentId,
        packageId,
        operationId,
      }),
    });
  } catch {
    throw new Error(
      "無法確認課卡銷售結果，請使用原本的操作重試，不要重新建立銷售。"
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      "無法確認課卡銷售結果，請使用原本的操作重試。"
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? "課卡販售失敗，請稍後再試。"
    );
  }

  return {
    packageName: data.packageName as string,
    packagePoints: data.packagePoints as number,
    packagePrice: data.packagePrice as number,
    newBalance: data.newBalance as number,
    saleId: data.saleId as string,
    alreadyProcessed: data.alreadyProcessed as boolean,
  };
}
