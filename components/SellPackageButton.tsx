"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { sellPackage } from "@/lib/sellPackageService";

type SellPackageButtonProps = {
  studentId: string;
  studentName: string;
  currentPoints: number;
};

type PackageData = {
  id: string;
  name: string;
  points: number;
  price: number;
  displayOrder: number;
  description: string;
  isActive: boolean;
};

export default function SellPackageButton({
  studentId,
  studentName,
  currentPoints,
}: SellPackageButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!showDialog) {
      return;
    }

    const packagesQuery = query(
      collection(db, "packages"),
      orderBy("displayOrder")
    );

    const unsubscribe = onSnapshot(
      packagesQuery,
      (snapshot) => {
        const nextPackages = snapshot.docs
          .map((packageDocument) => {
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
          })
          .filter((item) => item.isActive);

        setPackages(nextPackages);
      },
      (error) => {
        console.error(error);
        setMessage("讀取課卡商品失敗。");
      }
    );

    return unsubscribe;
  }, [showDialog]);

  const selectedPackage = packages.find(
    (item) => item.id === selectedPackageId
  );

  async function handleSellPackage() {
    const admin = auth.currentUser;

    if (!admin) {
      window.location.href = "/login";
      return;
    }

    if (!selectedPackage) {
      setMessage("請先選擇課卡商品。");
      return;
    }

    setMessage("");
    setIsSubmitting(true);

    try {
      const result = await sellPackage({
        adminId: admin.uid,
        studentId,
        packageId: selectedPackage.id,
      });

      setMessage(
        `販售成功！${studentName} 已增加 ${result.packagePoints} 點，目前共有 ${result.newBalance} 點。`
      );

      setSelectedPackageId("");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "課卡販售失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setSelectedPackageId("");
          setShowDialog(true);
        }}
        className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        售出課卡
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Sell Package
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              售出課卡給 {studentName}
            </h2>

            <div className="mt-6 rounded-2xl bg-sky-50 p-5">
              <p className="text-sm text-slate-500">
                目前點數
              </p>

              <p className="mt-2 text-4xl font-bold text-sky-700">
                {currentPoints} 點
              </p>
            </div>

            <div className="mt-6">
              <p className="font-semibold text-slate-800">
                選擇課卡
              </p>

              {packages.length === 0 ? (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-600">
                  目前沒有販售中的課卡。
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {packages.map((item) => (
                    <label
                      key={item.id}
                      className={`block cursor-pointer rounded-2xl border p-5 transition ${
                        selectedPackageId === item.id
                          ? "border-sky-500 bg-sky-50"
                          : "border-slate-200 bg-white hover:border-sky-200"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="radio"
                          name={`package-${studentId}`}
                          value={item.id}
                          checked={selectedPackageId === item.id}
                          onChange={() =>
                            setSelectedPackageId(item.id)
                          }
                          className="mt-1"
                        />

                        <div className="flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-slate-900">
                                {item.name}
                              </h3>

                              {item.description && (
                                <p className="mt-1 text-sm text-slate-500">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <p className="font-bold text-sky-700">
                              NT$ {item.price.toLocaleString()}
                            </p>
                          </div>

                          <p className="mt-3 text-sm font-semibold text-slate-700">
                            增加 {item.points} 點
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedPackage && (
              <div className="mt-6 rounded-2xl border border-sky-100 bg-white p-5">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-600">
                    課卡
                  </span>

                  <span className="font-semibold text-slate-900">
                    {selectedPackage.name}
                  </span>
                </div>

                <div className="mt-3 flex justify-between gap-4">
                  <span className="text-slate-600">
                    售價
                  </span>

                  <span className="font-semibold text-slate-900">
                    NT$ {selectedPackage.price.toLocaleString()}
                  </span>
                </div>

                <div className="mt-3 flex justify-between gap-4">
                  <span className="text-slate-600">
                    增加點數
                  </span>

                  <span className="font-semibold text-emerald-700">
                    +{selectedPackage.points} 點
                  </span>
                </div>

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-600">
                      販售後餘額
                    </span>

                    <span className="font-bold text-sky-700">
                      {currentPoints + selectedPackage.points} 點
                    </span>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {message}
              </p>
            )}

            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
              >
                關閉
              </button>

              <button
                type="button"
                onClick={handleSellPackage}
                disabled={!selectedPackage || isSubmitting}
                className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "處理中……" : "確認販售"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}