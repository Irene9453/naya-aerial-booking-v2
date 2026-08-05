"use client";

import { FormEvent, useState } from "react";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export default function AdminCreatePackage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const [price, setPrice] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

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
      await addDoc(collection(db, "packages"), {
        name: name.trim(),
        points: parsedPoints,
        price: parsedPrice,
        displayOrder: parsedDisplayOrder,
        description: description.trim(),
        isActive: true,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      setMessage("課卡建立成功！");
      setName("");
      setPoints("");
      setPrice("");
      setDisplayOrder("");
      setDescription("");
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "建立課卡失敗，請稍後再試。"
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
          setShowForm(true);
        }}
        className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700"
      >
        ＋ 新增課卡
      </button>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              Create Package
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              新增課卡
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
                  placeholder="例如：30 點課卡"
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
                    placeholder="例如：30"
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
                    placeholder="例如：4500"
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
                  placeholder="例如：1"
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
                  placeholder="例如：適合固定每週上課"
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-700">
                課卡目前設定為無限期，不會自動到期。
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
                  {isSubmitting ? "建立中……" : "建立課卡"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}