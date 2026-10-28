"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type ClaimRequest = {
  id: string;
  uid: string;
  phone: string;
  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;
  status: string;
};

export function AdminLegacyClaimReview() {
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const requestsQuery = query(
      collection(db, "legacyClaimRequests"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      requestsQuery,
      (snapshot) => {
        setRequests(
          snapshot.docs.map((document) => {
            const data = document.data();

            return {
              id: document.id,
              uid: String(data.uid ?? ""),
              phone: String(data.phone ?? ""),
              birthdayYear: Number(data.birthdayYear ?? 0),
              birthdayMonth: Number(data.birthdayMonth ?? 0),
              birthdayDay: Number(data.birthdayDay ?? 0),
              status: String(data.status ?? "pending"),
            };
          })
        );

        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(err);
        setError("無法讀取認領申請，請確認 Firestore 權限。");
        setLoading(false);
      }
    );
  }, []);

  const pendingRequests = requests.filter(
    (request) => request.status === "pending"
  );

  return (
    <section className="mb-8 rounded-3xl border border-violet-100 bg-violet-50 p-6">
      <h3 className="text-xl font-bold text-slate-900">
        舊會員認領申請審核
      </h3>

      <p className="mt-2 text-sm text-slate-600">
        目前有 {pendingRequests.length} 筆待審核申請。
      </p>

      {loading && (
        <p className="mt-5 text-sm text-slate-500">
          載入申請資料中……
        </p>
      )}

      {error && (
        <p className="mt-5 text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && pendingRequests.length === 0 && (
        <p className="mt-5 text-sm text-slate-500">
          目前沒有待審核的認領申請。
        </p>
      )}

      {!loading && !error && pendingRequests.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead>
              <tr className="border-b border-violet-200">
                <th className="px-3 py-3">申請手機</th>
                <th className="px-3 py-3">生日</th>
                <th className="px-3 py-3">申請帳號 UID</th>
                <th className="px-3 py-3">狀態</th>
              </tr>
            </thead>

            <tbody>
              {pendingRequests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b border-violet-100"
                >
                  <td className="px-3 py-3">{request.phone}</td>

                  <td className="px-3 py-3">
                    {request.birthdayYear || "—"}/
                    {String(request.birthdayMonth).padStart(2, "0")}/
                    {String(request.birthdayDay).padStart(2, "0")}
                  </td>

                  <td className="px-3 py-3 text-xs text-slate-500">
                    {request.uid}
                  </td>

                  <td className="px-3 py-3 font-semibold text-amber-700">
                    等待審核
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}