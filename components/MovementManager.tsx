"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type Movement = {
  id: string;
  code: string;
  name: string;
  category: string;
  level: string;
  note: string;
  active: boolean;
};

export default function MovementManager() {
  const [movements, setMovements] = useState<Movement[]>([]);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("aerialYoga");
  const [level, setLevel] = useState("Lv.0–1");
  const [note, setNote] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const movementQuery = query(
      collection(db, "movements"),
      orderBy("code", "asc")
    );

    const unsubscribe = onSnapshot(
      movementQuery,
      (snapshot) => {
        const nextMovements = snapshot.docs.map(
          (movementDocument) => {
            const data = movementDocument.data();

            return {
              id: movementDocument.id,
              code: String(data.code ?? ""),
              name: String(data.name ?? ""),
              category: String(data.category ?? ""),
              level: String(data.level ?? ""),
              note: String(data.note ?? ""),
              active: Boolean(data.active ?? true),
            };
          }
        );

        setMovements(nextMovements);
      },
      (error) => {
        console.error(error);
        setMessage("讀取動作資料失敗。");
      }
    );

    return unsubscribe;
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");

    const user = auth.currentUser;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const normalizedCode =
      code.trim().toUpperCase();

    const normalizedName =
      name.trim();

    if (!normalizedCode) {
      setMessage("請輸入動作編號。");
      return;
    }

    if (!normalizedName) {
      setMessage("請輸入動作名稱。");
      return;
    }

    const duplicate = movements.some(
      (movement) =>
        movement.code.toUpperCase() ===
        normalizedCode
    );

    if (duplicate) {
      setMessage(
        `動作編號 ${normalizedCode} 已經存在。`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(
        collection(db, "movements"),
        {
          code: normalizedCode,
          name: normalizedName,
          category,
          level,
          note: note.trim(),
          active: true,

          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setCode("");
      setName("");
      setNote("");

      setMessage(
        `已新增 ${normalizedCode} ${normalizedName}`
      );
    } catch (error: unknown) {
      console.error(error);

      setMessage(
        error instanceof Error
          ? error.message
          : "新增動作失敗，請稍後再試。"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            Movement Library
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            動作資料庫
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            目前共有 {movements.length} 組動作
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setMessage("");
            setShowForm(true);
          }}
          className="rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-700"
        >
          ＋ 新增動作
        </button>
      </div>

      {movements.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center">
          <p className="text-slate-600">
            目前還沒有建立動作資料。
          </p>
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          {movements.map((movement) => (
            <div
              key={movement.id}
              className="rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-sky-50 px-3 py-1 text-sm font-bold text-sky-700">
                      {movement.code}
                    </span>

                    <h3 className="font-bold text-slate-900">
                      {movement.name}
                    </h3>
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    {movement.category} ・ {movement.level}
                  </p>

                  {movement.note && (
                    <p className="mt-2 text-sm text-slate-600">
                      {movement.note}
                    </p>
                  )}
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    movement.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {movement.active ? "使用中" : "已停用"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/50 px-5 py-8">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl md:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
              New Movement
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              新增動作
            </h2>

            <form
              onSubmit={handleSubmit}
              className="mt-7"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    動作編號
                  </label>

                  <input
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value)
                    }
                    placeholder="例如 A01"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    動作名稱
                  </label>

                  <input
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder="例如 仙女系列"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    類別
                  </label>

                  <select
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="lowAerialYoga">
                      低空瑜珈
                    </option>

                    <option value="aerialYoga">
                      空中瑜珈
                    </option>

                    <option value="aerialSilk">
                      舞綢
                    </option>

                    <option value="aerialHoop">
                      空環
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block font-semibold text-slate-800">
                    難度
                  </label>

                  <select
                    value={level}
                    onChange={(event) =>
                      setLevel(event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="Lv.0">
                      Lv.0
                    </option>

                    <option value="Lv.0–1">
                      Lv.0–1
                    </option>

                    <option value="Lv.1–2">
                      Lv.1–2
                    </option>

                    <option value="Lv.3">
                      Lv.3
                    </option>

                    <option value="All">
                      不限程度
                    </option>
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-2 block font-semibold text-slate-800">
                  備註
                </label>

                <textarea
                  value={note}
                  onChange={(event) =>
                    setNote(event.target.value)
                  }
                  placeholder="可留空"
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-sky-500"
                />
              </div>

              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowForm(false)
                  }
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700"
                >
                  關閉
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {isSubmitting
                    ? "新增中……"
                    : "新增動作"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
}