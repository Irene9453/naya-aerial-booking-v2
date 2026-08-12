"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type PackageSaleData = {
  id: string;
  packageName: string;
  points: number;
  price: number;
  status: string;
  createdAt: Timestamp | null;
};

function getTaipeiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: parts.find((part) => part.type === "year")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminRevenueSummary() {
  const [sales, setSales] = useState<PackageSaleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const salesQuery = query(collection(db, "packageSales"));

    const unsubscribe = onSnapshot(
      salesQuery,
      (snapshot) => {
        const nextSales = snapshot.docs.map((saleDocument) => {
          const data = saleDocument.data();

          return {
            id: saleDocument.id,
            packageName: String(data.packageName ?? ""),
            points: Number(data.points ?? 0),
            price: Number(data.price ?? 0),
            status: String(data.status ?? ""),
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt
                : null,
          };
        });

        setSales(nextSales);
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        setMessage("讀取收入資料失敗。");
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const summary = useMemo(() => {
    const nowParts = getTaipeiDateParts(new Date());

    const completedSales = sales.filter(
      (sale) => sale.status === "completed"
    );

    let todayRevenue = 0;
    let monthRevenue = 0;
    let totalRevenue = 0;
    let monthSalesCount = 0;

    completedSales.forEach((sale) => {
      totalRevenue += sale.price;

      if (!sale.createdAt) {
        return;
      }

      const saleParts = getTaipeiDateParts(
        sale.createdAt.toDate()
      );

      const isThisMonth =
        saleParts.year === nowParts.year &&
        saleParts.month === nowParts.month;

      const isToday =
        isThisMonth &&
        saleParts.day === nowParts.day;

      if (isThisMonth) {
        monthRevenue += sale.price;
        monthSalesCount += 1;
      }

      if (isToday) {
        todayRevenue += sale.price;
      }
    });

    return {
      todayRevenue,
      monthRevenue,
      totalRevenue,
      monthSalesCount,
    };
  }, [sales]);

  if (isLoading) {
    return (
      <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
        <p className="text-center text-slate-600">
          收入資料載入中……
        </p>
      </article>
    );
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
          Revenue
        </p>

        <h2 className="mt-2 text-2xl font-bold text-slate-900">
          收入統計
        </h2>

        <p className="mt-2 text-sm text-slate-500">
          統計已完成的課卡販售紀錄。
        </p>
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}

      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-sky-50 p-5">
          <p className="text-sm font-semibold text-sky-700">
            今日收入
          </p>

          <p className="mt-3 text-3xl font-bold text-sky-800">
            {formatCurrency(summary.todayRevenue)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-600">
            本月收入
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-900">
            {formatCurrency(summary.monthRevenue)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-600">
            本月售出課卡
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-900">
            {summary.monthSalesCount} 張
          </p>
        </div>

        <div className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-sm font-semibold text-slate-300">
            累計收入
          </p>

          <p className="mt-3 text-3xl font-bold">
            {formatCurrency(summary.totalRevenue)}
          </p>
        </div>
      </div>
    </article>
  );
}