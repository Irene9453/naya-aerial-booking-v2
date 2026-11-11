import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

function taipeiYearMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find(p => p.type === "year")?.value),
    month: Number(parts.find(p => p.type === "month")?.value),
  };
}

/**
 * Admin-initiated campaign: notify only verified birthday-eligible students.
 * Does NOT issue, reserve, or grant any coupon; the existing purchase API is
 * still the single source of truth for the 7-off benefit and annual limit.
 * A deterministic notification document prevents duplicate sends in the same year.
 */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "請先登入管理員。" }, { status: 401 });
  }
  let adminId: string;
  try { adminId = (await adminAuth.verifyIdToken(authorization.slice(7), true)).uid; }
  catch { return NextResponse.json({ error: "管理員登入失效。" }, { status: 401 }); }
  try {
    const admin = await adminDb.collection("users").doc(adminId).get();
    if (!admin.exists || admin.data()?.role !== "admin") {
      return NextResponse.json({ error: "沒有管理員權限。" }, { status: 403 });
    }
    const { year, month } = taipeiYearMonth();
    if (year < 2020 || month < 1 || month > 12) {
      return NextResponse.json({ error: "無法確認目前台灣日期。" }, { status: 500 });
    }

    // Firestore data migrated from old systems can represent birthdayMonth
    // as either a string or a number. Filter after querying student accounts.
    const students = await adminDb.collection("users").where("role", "==", "student").get();
    const candidates = students.docs.filter(doc => Number(doc.data().birthdayMonth) === month);
    let notified = 0, alreadyNotified = 0, notEligible = 0, failed = 0;
    const failures: string[] = [];

    // Limit concurrency to avoid large transaction bursts and Firestore write limits.
    for (let i = 0; i < candidates.length; i += 5) {
      const group = await Promise.all(candidates.slice(i, i + 5).map(async candidate => {
        const uid = candidate.id;
        const notificationRef = adminDb.collection("notifications").doc(`birthday_benefit_${uid}_${year}`);
        const usageRef = adminDb.collection("birthdayCouponUsage").doc(`${uid}_${year}`);
        const memberRef = adminDb.collection("users").doc(uid);
        try {
          return await adminDb.runTransaction(async tx => {
            const [member, usage, existing] = await Promise.all([
              tx.get(memberRef), tx.get(usageRef), tx.get(notificationRef),
            ]);
            if (!member.exists || member.data()?.role !== "student" ||
                Number(member.data()?.birthdayMonth) !== month) return "notEligible";
            if (usage.exists && usage.data()?.status !== "released") return "notEligible";
            if (existing.exists) return "alreadyNotified";
            tx.create(notificationRef, {
              userId: uid,
              type: "birthday_benefit",
              title: "🎂 你的生日 7 折優惠已開放！",
              body: `生日快樂！${month} 月壽星可在本月使用一次課卡 7 折優惠，請到「我的紅利與優惠券」查看，並於本月最後一天前使用。優惠不能合併折扣。`,
              link: "/rewards",
              birthdayYear: year,
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
              createdBy: adminId,
            });
            return "notified";
          });
        } catch (error) {
          console.error("[Birthday Coupon] member notification failed", { uid, error });
          failures.push(uid);
          return "failed";
        }
      }));
      for (const result of group) {
        if (result === "notified") notified++;
        else if (result === "alreadyNotified") alreadyNotified++;
        else if (result === "notEligible") notEligible++;
        else failed++;
      }
    }
    return NextResponse.json({
      success: failed === 0, year, month,
      birthdayMembers: candidates.length, notified, alreadyNotified, notEligible, failed,
      ...(failed ? { error: "部分學生通知未完成，重新操作只會補送未通知者。" } : {}),
    }, { status: failed ? 207 : 200 });
  } catch (error) {
    console.error("[Birthday Coupon] campaign failed", error);
    return NextResponse.json({ error: "生日優惠通知失敗，請稍後重試。" }, { status: 500 });
  }
}
