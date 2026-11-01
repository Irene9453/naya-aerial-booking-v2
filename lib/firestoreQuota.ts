// Firestore/gRPC may expose numeric codes (8) or Firebase string codes.
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = String(value.code ?? "").toLowerCase();
  return code === "8" || code === "resource-exhausted" || code === "firestore/resource-exhausted" ||
    /RESOURCE_EXHAUSTED|Quota exceeded/i.test(`${String(value.message ?? "")} ${String(value.details ?? "")}`);
}
export const firestoreQuotaMessage = "資料庫配額或資源限制已達上限，暫時無法完成操作。請管理員檢查 Firebase 用量與方案，待恢復後再試，請勿連續重按。";
