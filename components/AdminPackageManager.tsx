"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AdminCreatePackage from "@/components/AdminCreatePackage";
import AdminEditPackage from "@/components/AdminEditPackage";

type PackageData = {
  id: string;
  name: string;
  points: number;
  price: number;
  displayOrder: number;
  description: string;
  isActive: boolean;
};

export default function AdminPackageManager() {
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const packagesQuery = query(
      collection(db, "packages"),
      orderBy("displayOrder")
    );

    const unsubscribe = onSnapshot(
      packagesQuery,
      (snapshot) => {
        const nextPackages = snapshot.docs.map((packageDocument) => {
          const data = packageDocument.data();

          return {
            id: packageDocument.id,
            name: String(data.name ?? ""),
            points: Number(data.points ?? 0),
            price: Number(data.price ?? 0),
            displayOrder: Number(data.displayOrder ?? 0),
            description: String(data.description ?? ""),
            isActive: Boolean(data.isActive ?? false),
          };
        });

        setPackages(nextPackages);
      },
      (error) => {
        console.error(error);
        setMessage("讀取課卡商品失敗。");
      }
    );

    return unsubscribe;
  }, []);

  async function handleToggleActive(
    packageId: string,
    currentStatus: boolean
  ) {
    setMessage("");

    try {
      await updateDoc(doc(db, "packages", packageId), {
        isActive: !currentStatus,
      });
    } catch (error) {
      console.error(error);
      setMessage("更新課卡狀態失敗。");
    }
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Packages
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            課卡商品
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            管理課卡點數、售價與販售狀態。
          </p>
        </div>

        <AdminCreatePackage />
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {message}
        </p>
      )}

      {packages.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前尚未建立課卡商品。
          </p>
        </div>
      ) : (
        <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((item) => (
            <div
              key={item.id}
              className="flex flex-col rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-xl">
                    🎫
                  </div>

                  <h3 className="text-xl font-bold text-slate-900">
                    {item.name || "未命名課卡"}
                  </h3>

                  {item.description && (
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {item.description}
                    </p>
                  )}
                </div>

                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    item.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {item.isActive ? "販售中" : "已停用"}
                </span>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">
                  課卡點數
                </p>

                <p className="mt-1 text-3xl font-bold text-sky-700">
                  {item.points} 點
                </p>

                <p className="mt-4 text-sm text-slate-500">
                  售價
                </p>

                <p className="mt-1 text-xl font-bold text-slate-900">
                  NT$ {item.price.toLocaleString()}
                </p>

                <p className="mt-4 text-sm text-slate-500">
                  使用期限：無限期
                </p>
              </div>

              <div className="mt-auto flex gap-3 pt-6">
                <AdminEditPackage
                  packageId={item.id}
                  initialName={item.name}
                  initialPoints={item.points}
                  initialPrice={item.price}
                  initialDisplayOrder={item.displayOrder}
                  initialDescription={item.description}
                />

                <button
                  type="button"
                  onClick={() =>
                    handleToggleActive(item.id, item.isActive)
                  }
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    item.isActive
                      ? "border border-red-300 text-red-600 hover:bg-red-50"
                      : "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {item.isActive ? "停用" : "重新啟用"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}