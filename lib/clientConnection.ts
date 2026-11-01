export function withConnectionTimeout<T>(promise: Promise<T>, milliseconds = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("CONNECTION_TIMEOUT"), { code: "unavailable" })), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function memberConnectionMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (["unavailable", "deadline-exceeded", "auth/network-request-failed"].includes(code) || /offline|CONNECTION_TIMEOUT|Failed to fetch/i.test(message)) {
    return "目前無法連線取得會員資料，請確認網路後按「重新載入」，或前往登入頁重試。";
  }
  if (code === "permission-denied") return "會員資料讀取權限驗證失敗，請重新登入；若持續發生，請聯絡老師。";
  return "暫時無法確認會員狀態，請重新載入或前往登入頁重試。";
}
