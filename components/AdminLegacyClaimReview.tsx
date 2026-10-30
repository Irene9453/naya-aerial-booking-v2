"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type ClaimRequest = {
  id: string;
  uid: string;
  phone: string;
  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;
  status: string;
};

type LegacyMember = {
  id: string;
  name: string;
  phone: string;
  birthdayYear: number;
  birthdayMonth: number;
  birthdayDay: number;
  points: number;
  rewardPoints: number;
  status: string;
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatBirthday(year: number, month: number, day: number) {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

export function AdminLegacyClaimReview() {
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [legacyMembers, setLegacyMembers] = useState<LegacyMember[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const unsubscribeRequests = onSnapshot(
      query(
        collection(db, "legacyClaimRequests"),
        orderBy("createdAt", "desc")
      ),
      (snapshot) => {
        setRequests(snapshot.docs.map((document) => {
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
        }));

        setRequestsLoading(false);
      },
      (err) => {
        console.error(err);
        setError("無法讀取認領申請。");
        setRequestsLoading(false);
      }
    );

    const unsubscribeMembers = onSnapshot(
      collection(db, "legacyMembers"),
      (snapshot) => {
        setLegacyMembers(snapshot.docs.map((document) => {
          const data = document.data();

          return {
            id: document.id,
            name: String(data.name ?? ""),
            phone: String(data.phoneNormalized ?? data.phone ?? ""),
            birthdayYear: Number(data.birthdayYear ?? 0),
            birthdayMonth: Number(data.birthdayMonth ?? 0),
            birthdayDay: Number(data.birthdayDay ?? 0),
            points: Number(data.points ?? 0),
            rewardPoints: Number(data.rewardPoints ?? 0),
            status: String(data.status ?? ""),
          };
        }));

        setMembersLoading(false);
      },
      (err) => {
        console.error(err);
        setError("無法讀取舊會員資料。");
        setMembersLoading(false);
      }
    );

    return () => {
      unsubscribeRequests();
      unsubscribeMembers();
    };
  }, []);

  const pendingRequests = requests.filter(
    (request) => request.status === "pending"
  );

  async function review(
    request: ClaimRequest,
    action: "approve" | "reject",
    legacy?: LegacyMember
  ) {
    if (busyId) return;

    if (action === "approve" && !legacy) {
      setError("找不到可核准的舊會員資料。");
      return;
    }

  const description = action === "approve"
  ? `確定核准 ${legacy?.name} 的認領申請，移轉 ${legacy?.points} 點及 ${legacy?.rewardPoints} 點獎勵點數？`
  : `確定拒絕手機 ${request.phone} 的認領申請？`;

if (!window.confirm(description)) return;

// 管理員必須確認已獨立核實舊會員身分
let identityVerificationMethod = "";

if (action === "approve") {
  const method = window.prompt(
    "請填寫身分確認方式，例如：已透過舊會員原有 LINE 對話確認。\n\n注意：僅比對手機、生日或新註冊 Email 不算完成身分確認。"
  );

  if (!method?.trim()) {
    setError("核准前必須完成身分確認，並填寫確認方式。");
    return;
  }

  identityVerificationMethod = method.trim();
}

    setBusyId(request.id);
    setError("");
    setMessage("");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("請先登入管理員帳號。");

      const token = await user.getIdToken();

      const url = action === "approve"
        ? "/api/admin/legacy-claims/approve"
        : "/api/admin/legacy-members/reject";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      body: JSON.stringify({
  requestId: request.id,
  ...(action === "approve" && legacy
    ? {
        legacyMemberId: legacy.id,
        identityVerificationMethod,
      }
    : {}),
}),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `審核失敗（HTTP ${response.status}）`);
      }

      setMessage(data.message || "審核完成。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "審核失敗。");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="mb-8 rounded-3xl border border-violet-100 bg-violet-50 p-6">
      <h3 className="text-xl font-bold text-slate-900">
        舊會員認領申請審核
      </h3>

      <p className="mt-2 text-sm text-slate-600">
        目前有 {pendingRequests.length} 筆待審核申請。
      </p>

      {message && (
        <p className="mt-4 rounded-xl bg-green-100 p-3 text-green-800">
          {message}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-100 p-3 text-red-800">
          {error}
        </p>
      )}

      {(requestsLoading || membersLoading) && (
        <p className="mt-5 text-sm text-slate-500">載入資料中……</p>
      )}

      {!requestsLoading && !membersLoading && pendingRequests.length === 0 && (
        <p className="mt-5 text-sm text-slate-500">
          目前沒有待審核的認領申請。
        </p>
      )}

      {!requestsLoading && !membersLoading && pendingRequests.length > 0 && (
        <div className="mt-5 space-y-4">
          {pendingRequests.map((request) => {
            const matches = legacyMembers.filter(
              (legacy) =>
                normalizePhone(legacy.phone) === normalizePhone(request.phone)
            );

            const legacy = matches.length === 1 ? matches[0] : undefined;

            const identityMatches = Boolean(
              legacy &&
              legacy.status === "unclaimed" &&
              legacy.birthdayYear === request.birthdayYear &&
              legacy.birthdayMonth === request.birthdayMonth &&
              legacy.birthdayDay === request.birthdayDay
            );

            return (
              <div key={request.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="font-semibold text-slate-900">
                  申請手機：{request.phone}
                </p>

                <p className="mt-2 text-sm text-slate-600">
                  申請生日：
                  {formatBirthday(
                    request.birthdayYear,
                    request.birthdayMonth,
                    request.birthdayDay
                  )}
                </p>

                {legacy ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="font-semibold">對應舊會員：{legacy.name}</p>
                    <p className="mt-2">
                      舊會員生日：
                      {formatBirthday(
                        legacy.birthdayYear,
                        legacy.birthdayMonth,
                        legacy.birthdayDay
                      )}
                    </p>
                    <p className="mt-2">
                      一般點數：{legacy.points}｜獎勵點數：{legacy.rewardPoints}
                    </p>
                    <p className={`mt-2 font-semibold ${
                      identityMatches ? "text-green-700" : "text-red-700"
                    }`}>
                      {identityMatches
                        ? "手機與完整生日相符"
                        : "資料不符或已認領，禁止核准"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-red-700">
                    找不到唯一對應的舊會員資料，禁止核准。
                  </p>
                )}

                <p className="mt-3 break-all text-xs text-slate-400">
                  申請 UID：{request.uid}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!identityMatches || Boolean(busyId)}
                    onClick={() => review(request, "approve", legacy)}
                    className="rounded-xl bg-green-600 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyId === request.id ? "處理中……" : "核准並移轉點數"}
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => review(request, "reject")}
                    className="rounded-xl bg-red-600 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    拒絕申請
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
