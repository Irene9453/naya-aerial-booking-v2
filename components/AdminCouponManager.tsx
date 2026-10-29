"use client";

import { useEffect, useState } from "react";
import {
  collection, doc, onSnapshot, setDoc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type CouponType = "new_student" | "birthday" | "reward";

type Coupon = {
  id: string;
  name: string;
  type: CouponType;
  discountRate: number;
  rewardCost: number;
  minimumPackagePoints: number;
  maximumPackagePoints: number | null;
  displayOrder: number;
  description: string;
  automatic: boolean;
  isActive: boolean;
};

const blank = {
  name: "",
  type: "reward" as CouponType,
  percent: "90",
  rewardCost: "27",
  min: "0",
  max: "",
  order: "99",
  description: "",
  automatic: false,
};

export default function AdminCouponManager() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [form, setForm] = useState({ ...blank });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return onSnapshot(collection(db, "coupons"), (snapshot) => {
      const next = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Coupon[];
      next.sort((a, b) =>
        (a.displayOrder ?? 99) - (b.displayOrder ?? 99)
      );
      setItems(next);
    }, (error) => {
      console.error(error);
      setMessage("讀取優惠券失敗，請確認管理員權限。");
    });
  }, []);

  function change(key: keyof typeof blank, value: string | boolean) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function create() {
    setEditing(null);
    setForm({ ...blank });
    setMessage("");
    setOpen(true);
  }

  function edit(item: Coupon) {
    setEditing(item.id);
    setForm({
      name: item.name ?? "",
      type: item.type ?? "reward",
      percent: String((item.discountRate ?? 1) * 100),
      rewardCost: String(item.rewardCost ?? 0),
      min: String(item.minimumPackagePoints ?? 0),
      max: item.maximumPackagePoints == null
        ? "" : String(item.maximumPackagePoints),
      order: String(item.displayOrder ?? 99),
      description: item.description ?? "",
      automatic: Boolean(item.automatic),
    });
    setMessage("");
    setOpen(true);
  }

  async function save() {
    const user = auth.currentUser;
    if (!user) return setMessage("請先登入管理員帳號。");

    const percent = Number(form.percent);
    const cost = Number(form.rewardCost);
    const min = Number(form.min);
    const max = form.max.trim() === "" ? null : Number(form.max);
    const order = Number(form.order);

    if (!form.name.trim()) return setMessage("請填寫優惠券名稱。");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
      return setMessage("應付比例必須大於 0 且不超過 100%。");
    if (!Number.isSafeInteger(cost) || cost < 0 ||
        (form.type === "reward" && cost <= 0))
      return setMessage("紅利兌換券必須設定大於 0 的整數點數。");
    if (!Number.isSafeInteger(min) || min < 0 ||
        (max !== null &&
          (!Number.isSafeInteger(max) || max < min)))
      return setMessage("適用課卡點數範圍不正確。");
    if (!Number.isSafeInteger(order) || order < 0)
      return setMessage("排序必須為非負整數。");

    setBusy(true);
    setMessage("");

    try {
      const data = {
        name: form.name.trim(),
        type: form.type,
        discountRate: percent / 100,
        rewardCost: form.type === "reward" ? cost : 0,
        minimumPackagePoints: min,
        maximumPackagePoints: max,
        displayOrder: order,
        description: form.description.trim(),
        automatic: form.type === "new_student" && form.automatic,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (editing) {
        await updateDoc(doc(db, "coupons", editing), data);
      } else {
        const ref = doc(collection(db, "coupons"));
        await setDoc(ref, {
          ...data,
          isActive: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      setOpen(false);
      setMessage(editing
        ? "優惠券已更新。"
        : "優惠券已新增，預設為停用。");
    } catch (error) {
      console.error(error);
      setMessage("儲存失敗，請確認管理員權限。");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Coupon) {
    if (!auth.currentUser) return;
    if (!confirm(`確定要${item.isActive ? "停用" : "啟用"}「${item.name}」？`))
      return;

    setBusy(true);
    try {
      await updateDoc(doc(db, "coupons", item.id), {
        isActive: !item.isActive,
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      setMessage("更新狀態失敗。");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "mt-1 w-full rounded-xl border border-slate-300 p-3";
  const buttonClass = "rounded-xl border px-4 py-2 font-semibold";

  return (
    <section className="mt-8 rounded-3xl bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">🎟️ 優惠券管理</h2>
          <p className="mt-2 text-sm text-slate-500">
            新增、編輯、啟用與停用優惠券
          </p>
        </div>
        <button onClick={create}
          className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white">
          ＋新增優惠券
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-slate-100 p-3">{message}</p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article key={item.id}
            className="rounded-2xl border border-slate-200 p-5">
            <div className="flex justify-between gap-3">
              <h3 className="text-lg font-bold">{item.name}</h3>
              <span className="text-sm">
                {item.isActive ? "🟢 啟用" : "⚪ 停用"}
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-sky-700">
              {Number(((item.discountRate ?? 1) * 10).toFixed(2))} 折優惠
            </p>
            <p className="mt-2 text-sm text-slate-600">
              類型：{item.type === "reward" ? "紅利兌換"
                : item.type === "birthday" ? "生日優惠" : "新生優惠"}
            </p>
            {item.type === "reward" && (
              <p className="text-sm">兌換需 {item.rewardCost} 紅利點</p>
            )}
            <p className="text-sm">
              課卡點數：{item.minimumPackagePoints ?? 0}～
              {item.maximumPackagePoints ?? "不限"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {item.description}
            </p>
            <div className="mt-5 flex gap-2">
              <button className={buttonClass}
                onClick={() => edit(item)}>編輯</button>
              <button className={buttonClass} disabled={busy}
                onClick={() => toggle(item)}>
                {item.isActive ? "停用" : "啟用"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-7">
            <h3 className="text-xl font-bold">
              {editing ? "編輯優惠券" : "新增優惠券"}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              例如輸入 85，代表會員支付原價的 85%（85 折）。
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>名稱
                <input className={inputClass} value={form.name}
                  onChange={(e) => change("name", e.target.value)} />
              </label>

              <label>類型
                <select className={inputClass} value={form.type}
                  onChange={(e) => change("type", e.target.value)}>
                  <option value="reward">紅利兌換</option>
                  <option value="birthday">生日優惠</option>
                  <option value="new_student">新生優惠</option>
                </select>
              </label>

              <label>應付比例（%）
                <input type="number" className={inputClass}
                  value={form.percent}
                  onChange={(e) => change("percent", e.target.value)} />
              </label>

              <label>紅利兌換點數
                <input type="number" className={inputClass}
                  disabled={form.type !== "reward"}
                  value={form.rewardCost}
                  onChange={(e) => change("rewardCost", e.target.value)} />
              </label>

              <label>課卡最低點數
                <input type="number" className={inputClass}
                  value={form.min}
                  onChange={(e) => change("min", e.target.value)} />
              </label>

              <label>課卡最高點數（空白＝不限）
                <input type="number" className={inputClass}
                  value={form.max}
                  onChange={(e) => change("max", e.target.value)} />
              </label>

              <label>顯示排序
                <input type="number" className={inputClass}
                  value={form.order}
                  onChange={(e) => change("order", e.target.value)} />
              </label>

              <label className="sm:col-span-2">優惠說明
                <textarea className={inputClass} rows={3}
                  value={form.description}
                  onChange={(e) => change("description", e.target.value)} />
              </label>
            </div>

            {message && (
              <p className="mt-4 text-sm text-red-600">{message}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button className={buttonClass} disabled={busy}
                onClick={() => setOpen(false)}>取消</button>
              <button disabled={busy} onClick={save}
                className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white">
                {busy ? "儲存中……" : "儲存優惠券"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}