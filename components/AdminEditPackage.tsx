"use client";

import { FormEvent, useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type AdminEditPackageProps = {
  packageId: string;
  initialName: string;
  initialPoints: number;
  initialPrice: number;
  initialDisplayOrder: number;
  initialDescription: string;
};

export default function AdminEditPackage({
  packageId,
  initialName,
  initialPoints,
  initialPrice,
  initialDisplayOrder,
  initialDescription,
}: AdminEditPackageProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(initialName);
  const [points, setPoints] = useState(String(initialPoints));
  const [price, setPrice] = useState(String(initialPrice));
  const [displayOrder, setDisplayOrder] = useState(
    String(initialDisplayOrder)
  );
  const [description, setDescription] = useState(initialDescription);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setName(initialName);
    setPoints(String(initialPoints));
    setPrice(String(initialPrice));
    setDisplayOrder(String(initialDisplayOrder));
    setDescription(initialDescription);
  }, [
    initialName,
    initialPoints,
    initialPrice,
    initialDisplayOrder,
    initialDescription,
  ]);

  function handleOpen() {
    setName(initialName);
    setPoints(String(initialPoints));
    setPrice(String(initialPrice));
    setDisplayOrder(String(initialDisplayOrder));
    setDescription(initialDescription);
    setMessage("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const parsedPoints = Number(points);
    const parsedPrice = Number(price);
    const parsedDisplayOrder = Number(displayOrder);

    if (!name.trim()) {
      setMessage("請輸入課卡名稱。");
      return;
    }

    if (!Number.isInteger(parsedPoints) || parsedPoints <= 0) {
      setMessage("點數必須是大於 0 的整數。");
      return;
    }

    if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
      setMessage("價格必須是 0 以上的整數。");
      return;
    }

    if (!Number.isInteger(parsedDisplayOrder)) {
      setMessage("顯示順序必須是整數。");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateDoc(doc(db, "packages", packageId), {
        name: name.trim(),
        points: parsedPoints,
        price: parsedPrice,
        displayOrder: parsedDisplayOrder,
        description: description.trim(),
      });

      setMessage("課卡更新成功！");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "更新課卡失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex-1 rounded-xl border border-sky-300 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
      >
        編輯
      </button>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Edit Package
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              編輯課卡
            </h2>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label className="mb-2 block font-semibold text-slate-800">
                  課卡名稱
                </label>

                <input
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    點數
                  </label>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={points}
                    onChange={(event) => setPoints(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    價格
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block font-semibold text-slate-800">
                  顯示順序
                </label>

                <input
                  type="number"
                  step="1"
                  required
                  value={displayOrder}
                  onChange={(event) =>
                    setDisplayOrder(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="mb-2 block font-semibold text-slate-800">
                  說明
                </label>

                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                目前所有課卡皆為永久有效。
              </div>

              {message && (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {message}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
                >
                  關閉
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting ? "儲存中……" : "儲存修改"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}