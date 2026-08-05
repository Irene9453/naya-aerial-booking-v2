"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminCreatePackage from "@/components/AdminCreatePackage";

type PackageData = {
  id: string;
  name: string;
  points: number;
  price: number;
  validDays: number;
  isActive: boolean;
  displayOrder?: number;
  description?: string;
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageData[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "packages"),
      orderBy("displayOrder")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPackages(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<PackageData, "id">),
        }))
      );
    });

    return unsubscribe;
  }, []);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Packages
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            課卡商品
          </h1>
        </div>

       <AdminCreatePackage />
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((item) => (
          <article
            key={item.id}
            className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm"
          >
            <h2 className="text-2xl font-bold">
              {item.name}
            </h2>

            {item.description && (
              <p className="mt-2 text-slate-500">
                {item.description}
              </p>
            )}

            <div className="mt-6 space-y-2 text-lg">
              <p>
                🎫 {item.points} 點
              </p>

              <p>
                💰 NT$ {item.price.toLocaleString()}
              </p>

              <p>
                ⏰ {item.validDays} 天
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span
                className={`rounded-full px-3 py-1 text-sm ${
                  item.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {item.isActive ? "販售中" : "已停用"}
              </span>

              <button className="text-sky-600 font-semibold">
                編輯
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}