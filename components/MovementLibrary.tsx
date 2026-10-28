"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type Movement = {
  id: string;
  code: string;
  name: string;
  category: string;
  level: string;
  active: boolean;
};

export default function MovementLibrary() {
  const [movements, setMovements] =
    useState<Movement[]>([]);

  const [showForm, setShowForm] =
    useState(false);

  const [showBulkForm, setShowBulkForm] =
    useState(false);

  const [code, setCode] =
    useState("");

  const [name, setName] =
    useState("");

  const [category, setCategory] =
    useState("aerialYoga");

  const [level, setLevel] =
    useState("All");

  const [bulkText, setBulkText] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    const movementQuery = query(
      collection(db, "movements"),
      orderBy("code", "asc")
    );

    const unsubscribe = onSnapshot(
      movementQuery,
      (snapshot) => {
        const nextMovements =
          snapshot.docs.map(
            (movementDocument) => {
              const data =
                movementDocument.data();

              return {
                id: movementDocument.id,
                code: String(
                  data.code ?? ""
                ),
                name: String(
                  data.name ?? ""
                ),
                category: String(
                  data.category ?? ""
                ),
                level: String(
                  data.level ?? ""
                ),
                active: Boolean(
                  data.active ?? true
                ),
              };
            }
          );

        setMovements(
          nextMovements
        );
      },
      (error) => {
        console.error(error);

        setMessage(
          "讀取動作資料失敗。"
        );
      }
    );

    return unsubscribe;
  }, []);

  async function handleAddMovement(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");

    const user =
      auth.currentUser;

    if (!user) {
      window.location.href =
        "/login";
      return;
    }

    const normalizedCode =
      code.trim().toUpperCase();

    const normalizedName =
      name.trim();

    if (!normalizedCode) {
      setMessage(
        "請輸入動作編號。"
      );
      return;
    }

    const duplicate =
      movements.some(
        (movement) =>
          movement.code.toUpperCase() ===
          normalizedCode
      );

    if (duplicate) {
      setMessage(
        `動作編號 ${normalizedCode} 已存在。`
      );
      return;
    }

    setIsSaving(true);

    try {
      await addDoc(
        collection(db, "movements"),
        {
          code:
            normalizedCode,

          name:
            normalizedName,

          category,

          level,

          active: true,

          createdBy:
            user.uid,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      setCode("");
      setName("");

      setMessage(
        `已新增 ${normalizedCode}`
      );

      setShowForm(false);
    } catch (error) {
      console.error(error);

      setMessage(
        "新增動作失敗。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBulkAdd() {
    setMessage("");

    const user =
      auth.currentUser;

    if (!user) {
      window.location.href =
        "/login";
      return;
    }

    const lines =
      bulkText
        .split("\n")
        .map((line) =>
          line.trim()
        )
        .filter(Boolean);

    if (lines.length === 0) {
      setMessage(
        "請輸入至少一個動作編號。"
      );
      return;
    }

    const existingCodes =
      new Set(
        movements.map(
          (movement) =>
            movement.code.toUpperCase()
        )
      );

    const parsedRows =
      lines
        .map((line) => {
          const parts =
            line.split(
              /\s+/
            );

          const movementCode =
            String(
              parts.shift() ?? ""
            )
              .trim()
              .toUpperCase();

          const movementName =
            parts.join(" ").trim();

          return {
            code:
              movementCode,
            name:
              movementName,
          };
        })
        .filter(
          (item) =>
            item.code &&
            !existingCodes.has(
              item.code
            )
        );

    if (
      parsedRows.length === 0
    ) {
      setMessage(
        "沒有新的動作可新增。"
      );
      return;
    }

    setIsSaving(true);

    try {
      const batch =
        writeBatch(db);

      parsedRows.forEach(
        (movement) => {
          const movementRef =
            doc(
              collection(
                db,
                "movements"
              )
            );

          batch.set(
            movementRef,
            {
              code:
                movement.code,

              name:
                movement.name,

              category,

              level,

              active: true,

              createdBy:
                user.uid,

              createdAt:
                serverTimestamp(),

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      await batch.commit();

      setBulkText("");

      setShowBulkForm(false);

      setMessage(
        `已新增 ${parsedRows.length} 個動作。`
      );
    } catch (error) {
      console.error(error);

      setMessage(
        "批次新增失敗。"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="mt-8 rounded-3xl bg-white p-7 shadow-sm md:p-9">

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">
            Movement Library
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            動作資料庫
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            目前共有{" "}
            {movements.length} 個動作
          </p>
        </div>

        <div className="flex flex-wrap gap-3">

          <button
            type="button"
            onClick={() => {
              setMessage("");
              setShowBulkForm(true);
            }}
            className="rounded-xl border border-violet-300 px-5 py-3 font-semibold text-violet-700 transition hover:bg-violet-50"
          >
            批次新增
          </button>

          <button
            type="button"
            onClick={() => {
              setMessage("");
              setShowForm(true);
            }}
            className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white transition hover:bg-violet-700"
          >
            ＋ 新增動作
          </button>
        </div>
      </div>

      {message && (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {message}
        </p>
      )}

      {movements.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-slate-50 px-5 py-8 text-center text-slate-500">
          目前尚未建立動作。
        </div>
      ) : (
        <div className="mt-7 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-semibold">
                  編號
                </th>

                <th className="px-4 py-3 font-semibold">
                  名稱
                </th>

                <th className="px-4 py-3 font-semibold">
                  類別
                </th>

                <th className="px-4 py-3 font-semibold">
                  難度
                </th>
              </tr>
            </thead>

            <tbody>
              {movements.map(
                (movement) => (
                  <tr
                    key={
                      movement.id
                    }
                    className="border-b border-slate-100"
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-bold text-violet-700">
                      {
                        movement.code
                      }
                    </td>

                    <td className="px-4 py-4 text-slate-700">
                      {movement.name ||
                        "未命名"}
                    </td>

                    <td className="px-4 py-4 text-slate-600">
                      {
                        movement.category
                      }
                    </td>

                    <td className="px-4 py-4 text-slate-600">
                      {
                        movement.level
                      }
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl">

            <h2 className="text-2xl font-bold text-slate-900">
              新增動作
            </h2>

            <form
              onSubmit={
                handleAddMovement
              }
              className="mt-6 space-y-5"
            >
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                  )
                }
                placeholder="動作編號，例如 EP.12"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />

              <input
                value={name}
                onChange={(event) =>
                  setName(
                    event.target.value
                  )
                }
                placeholder="動作名稱，可留空"
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
              />

              <select
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="aerialYoga">
                  空中瑜珈
                </option>

                <option value="lowAerialYoga">
                  低空瑜珈
                </option>

                <option value="aerialSilk">
                  舞綢
                </option>

                <option value="aerialHoop">
                  空環
                </option>
              </select>

              <select
                value={level}
                onChange={(event) =>
                  setLevel(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
              >
                <option value="All">
                  不限程度
                </option>

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
              </select>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowForm(
                      false
                    )
                  }
                  className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold"
                >
                  取消
                </button>

                <button
                  type="submit"
                  disabled={
                    isSaving
                  }
                  className="flex-1 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {isSaving
                    ? "新增中……"
                    : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkForm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-7 shadow-2xl">

            <h2 className="text-2xl font-bold text-slate-900">
              批次新增動作
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              一行一個編號，也可以在編號後面加名稱。
            </p>

            <textarea
              value={bulkText}
              onChange={(event) =>
                setBulkText(
                  event.target.value
                )
              }
              rows={12}
              placeholder={`EP.01 仙女
EP.02 蝴蝶
EP.03 鳥巢
EP.04`}
              className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono"
            />

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setShowBulkForm(
                    false
                  )
                }
                className="flex-1 rounded-xl border border-slate-300 px-5 py-3 font-semibold"
              >
                取消
              </button>

              <button
                type="button"
                onClick={
                  handleBulkAdd
                }
                disabled={
                  isSaving
                }
                className="flex-1 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {isSaving
                  ? "新增中……"
                  : "批次新增"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}