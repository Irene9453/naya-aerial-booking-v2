import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebaseAdmin";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function checkLegacyPrecheckRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfter: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const windowEnd = windowStart + WINDOW_MS;

  // 僅保存 IP 的雜湊值，不保存原始 IP。
  const ipHash = createHash("sha256")
    .update(ip)
    .digest("hex");

  const docId = `${windowStart}_${ipHash}`;

  const ref = adminDb
    .collection("legacyPrecheckRateLimits")
    .doc(docId);

  return adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);

    const count = Number(snapshot.data()?.count ?? 0);

    if (count >= MAX_ATTEMPTS) {
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((windowEnd - now) / 1000)
        ),
      };
    }

    tx.set(
      ref,
      {
        count: count + 1,
        windowStart,
        expiresAt: new Date(windowEnd + WINDOW_MS),
      },
      { merge: true }
    );

    return {
      allowed: true,
      retryAfter: 0,
    };
  });
}