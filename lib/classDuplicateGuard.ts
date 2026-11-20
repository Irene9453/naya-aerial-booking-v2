/** A cancelled class remains in Firestore as history but does not occupy a live slot. */
export function classifyMatchingClasses(
  matches: Array<{ id: string; status: unknown }>
): { blocked: boolean; cancelled: number; blockingIds: string[] } {
  const blocking = matches.filter((item) =>
    !["cancelled", "canceled", "admin_cancelled"].includes(String(item.status ?? ""))
  );
  return {
    blocked: blocking.length > 0,
    cancelled: matches.length - blocking.length,
    blockingIds: blocking.map((item) => item.id),
  };
}
