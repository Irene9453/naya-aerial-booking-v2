"use client";

import { useState } from "react";
import {
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const couponTemplates = [
  {
    id: "new_student_under_25",
    name: "新生 9 折優惠",
    type: "new_student",
    discountRate: 0.9,
    rewardCost: 0,
    minimumPackagePoints: 0,
    maximumPackagePoints: 24,
    automatic: true,
    isActive: true,
    displayOrder: 1,
    description: "新生購買 24 點以下方案可享 9 折。",
  },
  {
    id: "new_student_25_plus",
    name: "新生 85 折優惠",
    type: "new_student",
    discountRate: 0.85,
    rewardCost: 0,
    minimumPackagePoints: 25,
    maximumPackagePoints: null,
    automatic: true,
    isActive: true,
    displayOrder: 2,
    description: "新生購買 25 點以上方案可享 85 折。",
  },
  {
    id: "birthday_70",
    name: "生日 7 折優惠券",
    type: "birthday",
    discountRate: 0.7,
    rewardCost: 0,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 3,
    description: "舊生生日優惠，符合資格時可享 7 折。",
  },
  {
    id: "reward_90",
    name: "紅利 9 折券",
    type: "reward",
    discountRate: 0.9,
    rewardCost: 27,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 4,
    description: "使用 27 點紅利兌換。",
  },
  {
    id: "reward_85",
    name: "紅利 85 折券",
    type: "reward",
    discountRate: 0.85,
    rewardCost: 45,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 5,
    description: "使用 45 點紅利兌換。",
  },
  {
    id: "reward_80",
    name: "紅利 8 折券",
    type: "reward",
    discountRate: 0.8,
    rewardCost: 90,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 6,
    description: "使用 90 點紅利兌換。",
  },
  {
    id: "reward_75",
    name: "紅利 75 折券",
    type: "reward",
    discountRate: 0.75,
    rewardCost: 135,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 7,
    description: "使用 135 點紅利兌換。",
  },
  {
    id: "reward_70",
    name: "紅利 7 折券",
    type: "reward",
    discountRate: 0.7,
    rewardCost: 180,
    minimumPackagePoints: 0,
    maximumPackagePoints: null,
    automatic: false,
    isActive: true,
    displayOrder: 8,
    description: "使用 180 點紅利兌換。",
  },
] as const;

export default function AdminInitializeCoupons() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleInitialize() {
    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const confirmed = window.confirm(
      "要建立或更新 Naya Aerial 的優惠券規則嗎？"
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setIsSubmitting(true);

    try {
      const batch = writeBatch(db);

      couponTemplates.forEach((coupon) => {
        const couponRef = doc(db, "coupons", coupon.id);

        batch.set(
          couponRef,
          {
            ...coupon,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();

      setMessage("優惠券規則建立完成！");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "建立優惠券規則失敗。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
        Coupons
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        優惠券制度
      </h2>

      <p className="mt-3 leading-7 text-slate-600">
        建立新生優惠、生日優惠，以及 VIP 紅利兌換券。
      </p>

      <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-7 text-slate-700">
        <p>新生：24 點以下 9 折，25 點以上 85 折</p>
        <p>生日優惠：7 折</p>
        <p>紅利兌換：27／45／90／135／180 點</p>
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={handleInitialize}
        disabled={isSubmitting}
        className="mt-6 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
      >
        {isSubmitting
          ? "建立規則中……"
          : "建立／更新優惠券規則"}
      </button>
    </div>
  );
}