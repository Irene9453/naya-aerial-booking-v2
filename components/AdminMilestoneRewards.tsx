"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

type CertificateLevel = 100 | 300 | 500;
type GiftStatus = "not_claimed" | "notified" | "claimed";

type CertificateInfo = {
  issued: boolean;
  certificateName: string | null;
  certificateNumber: string | null;
  issueDate: string | null;
};

type RewardInfo = {
  milestoneClasses: CertificateLevel;
  certificate: CertificateInfo;
};

type StudentRewardInfo = {
  userId: string;
  name: string;
  nickname: string;
  email: string;
  journeyLegacyClasses: number;
  rewards: RewardInfo[];
};

type RewardsResponse = {
  success: boolean;
  students?: StudentRewardInfo[];
  totalCertificates?: number;
  error?: string;
};

type GiftInfo = {
  userId: string;
  milestoneClasses: CertificateLevel;
  status: GiftStatus;
  claimedAt: string | null;
  eligible: boolean;
};

type GiftResponse = {
  success: boolean;
  completedClasses?: number;
  gifts?: GiftInfo[];
  error?: string;
};

type GiftHistoryItem = {
  id: string;
  previousStatus: GiftStatus;
  newStatus: GiftStatus;
  previousClaimedAt: string | null;
  claimedAt: string | null;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string | null;
};

type HistoryResponse = {
  success: boolean;
  history?: GiftHistoryItem[];
  error?: string;
};

type StudentGiftData = {
  completedClasses: number;
  gifts: GiftInfo[];
};

const LEVELS: CertificateLevel[] = [100, 300, 500];

const MILESTONE_NAMES: Record<CertificateLevel, string> = {
  100: "百堂星光",
  300: "銀河漫遊",
  500: "無垠之翼",
};

const MILESTONE_EMOJIS: Record<CertificateLevel, string> = {
  100: "💎",
  300: "🪐",
  500: "🌌",
};

const GIFT_STATUS_LABELS: Record<GiftStatus, string> = {
  not_claimed: "尚未領取",
  notified: "已通知",
  claimed: "已領取",
};

function getStudentDisplayName(student: StudentRewardInfo) {
  return (
    student.name?.trim() ||
    student.nickname?.trim() ||
    student.email?.trim() ||
    "未設定姓名"
  );
}

function isGiftStatus(value: unknown): value is GiftStatus {
  return (
    value === "not_claimed" ||
    value === "notified" ||
    value === "claimed"
  );
}

function formatHistoryTime(value: string | null) {
  if (!value) return "時間未記錄";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "時間格式不正確";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
// 產生實體禮物 LINE 通知文字
function createGiftNotificationMessage(
  studentName: string,
  milestoneClasses: CertificateLevel
) {
  const milestoneName =
    MILESTONE_NAMES[milestoneClasses];

  return `嗨～${studentName} 🩵

恭喜你完成 ${milestoneClasses} 堂空中旅程！🎉

從第一次接觸空中運動，到現在累積了 ${milestoneClasses} 堂，每一次練習都是值得紀念的成長。

為了慶祝你解鎖「${milestoneName}」里程碑，Naya Aerial 特別準備了一份小禮物送給你！🎁

下次來上課時，記得找娜婭領取唷～

謝謝你一路以來的陪伴，
期待我們一起繼續飛向更多美好的時刻！🪽

Naya Aerial
Float with Strength. Find Yourself Within.`;
}
export default function AdminMilestoneRewards() {
  const [students, setStudents] = useState<StudentRewardInfo[]>([]);
  const [totalCertificates, setTotalCertificates] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [selectedLevel, setSelectedLevel] = useState<
    "all" | "100" | "300" | "500"
  >("all");

  const [issuedOnly, setIssuedOnly] = useState(false);
  const [attentionFilter, setAttentionFilter] = useState<
    "all" | "missing_name" | "pending_gift" | "claimed_gift"
  >("all");
  const [loadingAllGifts, setLoadingAllGifts] = useState(false);
  const [allGiftProgress, setAllGiftProgress] = useState(0);
  const [allGiftErrors, setAllGiftErrors] = useState(0);
  const giftBatchVersion = useRef(0);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  const [giftData, setGiftData] = useState<
    Record<string, StudentGiftData>
  >({});

  const [giftLoadingUserIds, setGiftLoadingUserIds] = useState<
    string[]
  >([]);

  const [giftSavingKey, setGiftSavingKey] = useState<string | null>(
    null
  );

  const [giftErrors, setGiftErrors] = useState<
    Record<string, string>
  >({});

  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState<
    string[]
  >([]);

  const [historyData, setHistoryData] = useState<
    Record<string, GiftHistoryItem[]>
  >({});

  const [historyLoadingKeys, setHistoryLoadingKeys] = useState<
    string[]
  >([]);

  const [historyErrors, setHistoryErrors] = useState<
    Record<string, string>
  >({});

  const loadRewards = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const user = auth.currentUser;

        if (!user) {
          throw new Error("請先登入管理員帳號。");
        }

        const token = await user.getIdToken();

        const response = await fetch(
          "/api/admin/journey/rewards",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const result: RewardsResponse = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ?? "無法讀取里程碑獎勵資料。"
          );
        }

        setStudents(
          Array.isArray(result.students) ? result.students : []
        );

        setTotalCertificates(
          Number(result.totalCertificates ?? 0)
        );

        giftBatchVersion.current += 1;
        setLoadingAllGifts(false);
        setAllGiftProgress(0);
        setAllGiftErrors(0);
        setGiftData({});
        setHistoryData({});
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "讀取獎勵資料失敗。"
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        void loadRewards();
      } else {
        giftBatchVersion.current += 1;
        setLoadingAllGifts(false);
        setStudents([]);
        setGiftData({});
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [loadRewards]);

  const missingNameCount = useMemo(
    () => students.reduce(
      (count, student) => count + student.rewards.filter(
        (reward) => reward.certificate.issued &&
          !reward.certificate.certificateName?.trim()
      ).length,
      0
    ),
    [students]
  );

  const giftOverview = useMemo(() => {
    let pending = 0;
    let claimed = 0;
    let notified = 0;
    let eligible = 0;
    Object.values(giftData).forEach((data) => {
      data.gifts.forEach((gift) => {
        if (!gift.eligible) return;
        eligible += 1;
        if (gift.status === "claimed") claimed += 1;
        else if (gift.status === "notified") notified += 1;
        else pending += 1;
      });
    });
    return { pending, claimed, notified, eligible };
  }, [giftData]);

  const giftDataComplete = students.length > 0 &&
    students.every((student) => giftData[student.userId] !== undefined);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();

    return students.filter((student) => {
      if (keyword && ![
        student.name ?? "",
        student.nickname ?? "",
        student.email ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(keyword))) {
        return false;
      }

      const relevant = student.rewards.filter((reward) =>
        selectedLevel === "all" ||
        String(reward.milestoneClasses) === selectedLevel
      );

      if (issuedOnly && !relevant.some((reward) => reward.certificate.issued)) {
        return false;
      }

      if (attentionFilter === "missing_name") {
        return relevant.some((reward) =>
          reward.certificate.issued &&
          !reward.certificate.certificateName?.trim()
        );
      }

      if (attentionFilter === "pending_gift" || attentionFilter === "claimed_gift") {
        const data = giftData[student.userId];
        if (!data) return false;
        return data.gifts.some((gift) =>
          gift.eligible &&
          (selectedLevel === "all" || String(gift.milestoneClasses) === selectedLevel) &&
          (attentionFilter === "claimed_gift"
            ? gift.status === "claimed"
            : gift.status !== "claimed")
        );
      }

      return true;
    });
  }, [students, search, selectedLevel, issuedOnly, attentionFilter, giftData]);

  // 需要時才批次讀取全部會員禮物，避免每次開啟後台就發出大量請求。
  // 同時最多四個請求，避免對 Firestore 造成不必要的負擔。
  async function loadAllStudentGifts() {
    if (loadingAllGifts || loading || refreshing) return;
    const batchVersion = ++giftBatchVersion.current;
    setLoadingAllGifts(true);
    setAllGiftProgress(0);
    setAllGiftErrors(0);

    const pendingStudents = students.filter(
      (student) => !giftData[student.userId]
    );
    if (pendingStudents.length === 0) {
      setLoadingAllGifts(false);
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("請先登入管理員帳號。");
      const token = await user.getIdToken();
      let cursor = 0;
      let completed = 0;
      let failures = 0;

      async function worker() {
        while (cursor < pendingStudents.length &&
          batchVersion === giftBatchVersion.current) {
          const student = pendingStudents[cursor++];
          try {
            const response = await fetch(
              `/api/admin/journey/gifts?userId=${encodeURIComponent(student.userId)}`,
              { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
            );
            const result: GiftResponse = await response.json();
            if (!response.ok || !result.success || !Array.isArray(result.gifts)) {
              throw new Error(result.error ?? "讀取禮物資料失敗。");
            }
            if (batchVersion !== giftBatchVersion.current) return;
            setGiftData((previous) => ({
              ...previous,
              [student.userId]: {
                completedClasses: Number(result.completedClasses ?? 0),
                gifts: result.gifts ?? [],
              },
            }));
          } catch (err) {
            failures += 1;
            if (batchVersion !== giftBatchVersion.current) return;
            setGiftErrors((previous) => ({
              ...previous,
              [student.userId]: err instanceof Error ? err.message : "讀取失敗。",
            }));
          } finally {
            completed += 1;
            if (batchVersion === giftBatchVersion.current) {
              setAllGiftProgress(completed);
              setAllGiftErrors(failures);
            }
          }
        }
      }

      await Promise.all(Array.from(
        { length: Math.min(4, pendingStudents.length) },
        () => worker()
      ));
    } catch (err) {
      if (batchVersion === giftBatchVersion.current) {
        setError(err instanceof Error ? err.message : "載入全體禮物資料失敗。");
      }
    } finally {
      if (batchVersion === giftBatchVersion.current) setLoadingAllGifts(false);
    }
  }

  const issuedCounts = useMemo(() => {
    const counts: Record<CertificateLevel, number> = {
      100: 0,
      300: 0,
      500: 0,
    };

    students.forEach((student) => {
      student.rewards.forEach((reward) => {
        if (reward.certificate.issued) {
          counts[reward.milestoneClasses] += 1;
        }
      });
    });

    return counts;
  }, [students]);

  async function loadStudentGifts(userId: string) {
    setGiftLoadingUserIds((previous) =>
      previous.includes(userId)
        ? previous
        : [...previous, userId]
    );

    setGiftErrors((previous) => ({
      ...previous,
      [userId]: "",
    }));

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("請先登入管理員帳號。");
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `/api/admin/journey/gifts?userId=${encodeURIComponent(
          userId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const result: GiftResponse = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.gifts)
      ) {
        throw new Error(
          result.error ?? "無法讀取實體禮物紀錄。"
        );
      }

      setGiftData((previous) => ({
        ...previous,
        [userId]: {
          completedClasses: Number(result.completedClasses ?? 0),
          gifts: result.gifts ?? [],
        },
      }));
    } catch (err) {
      setGiftErrors((previous) => ({
        ...previous,
        [userId]:
          err instanceof Error
            ? err.message
            : "讀取禮物紀錄失敗。",
      }));
    } finally {
      setGiftLoadingUserIds((previous) =>
        previous.filter((id) => id !== userId)
      );
    }
  }

  function toggleExpanded(userId: string) {
    const expanded = expandedUserIds.includes(userId);

    if (expanded) {
      setExpandedUserIds((previous) =>
        previous.filter((id) => id !== userId)
      );
      return;
    }

    setExpandedUserIds((previous) => [...previous, userId]);

    void loadStudentGifts(userId);
  }

  async function loadGiftHistory(
    userId: string,
    milestoneClasses: CertificateLevel
  ) {
    const key = `${userId}_${milestoneClasses}`;

    setHistoryLoadingKeys((previous) =>
      previous.includes(key) ? previous : [...previous, key]
    );

    setHistoryErrors((previous) => ({
      ...previous,
      [key]: "",
    }));

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("請先登入管理員帳號。");
      }

      const token = await user.getIdToken();

      const params = new URLSearchParams({
        userId,
        milestoneClasses: String(milestoneClasses),
      });

      const response = await fetch(
        `/api/admin/journey/gifts/history?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const result: HistoryResponse = await response.json();

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.history)
      ) {
        throw new Error(
          result.error ?? "無法讀取操作歷程。"
        );
      }

      setHistoryData((previous) => ({
        ...previous,
        [key]: result.history ?? [],
      }));
    } catch (err) {
      setHistoryErrors((previous) => ({
        ...previous,
        [key]:
          err instanceof Error
            ? err.message
            : "讀取操作歷程失敗。",
      }));
    } finally {
      setHistoryLoadingKeys((previous) =>
        previous.filter((item) => item !== key)
      );
    }
  }

  function toggleHistory(
    userId: string,
    milestoneClasses: CertificateLevel
  ) {
    const key = `${userId}_${milestoneClasses}`;

    if (expandedHistoryKeys.includes(key)) {
      setExpandedHistoryKeys((previous) =>
        previous.filter((item) => item !== key)
      );
      return;
    }

    setExpandedHistoryKeys((previous) => [...previous, key]);

    void loadGiftHistory(userId, milestoneClasses);
  }
// 複製實體禮物 LINE 通知文字
async function copyGiftNotification(
  student: StudentRewardInfo,
  milestoneClasses: CertificateLevel
) {
  const studentName = getStudentDisplayName(student);

  const message = createGiftNotificationMessage(
    studentName,
    milestoneClasses
  );

  try {
    await navigator.clipboard.writeText(message);

    window.alert(
      `已複製「${studentName}」的 ${milestoneClasses} 堂禮物通知！\n\n請貼到 LINE 傳送給會員。\n\n傳送完成後，再將禮物狀態改為「已通知」。`
    );
  } catch (error) {
    console.error("複製通知失敗：", error);

    window.prompt(
      "無法自動複製，請手動複製以下通知文字：",
      message
    );
  }
}
  async function updateGiftStatus(
    student: StudentRewardInfo,
    milestoneClasses: CertificateLevel,
    nextStatus: GiftStatus
  ) {
    const userId = student.userId;

    const currentGift = giftData[userId]?.gifts.find(
      (gift) => gift.milestoneClasses === milestoneClasses
    );

    if (!currentGift) {
      setGiftErrors((previous) => ({
        ...previous,
        [userId]: "找不到禮物紀錄，請重新展開會員。",
      }));
      return;
    }

    if (!currentGift.eligible) {
      setGiftErrors((previous) => ({
        ...previous,
        [userId]: "會員尚未達成此里程碑。",
      }));
      return;
    }

    if (currentGift.status === nextStatus) return;

    const studentName = getStudentDisplayName(student);

    if (nextStatus === "claimed") {
      if (
        !window.confirm(
          `確認已將 ${milestoneClasses} 堂實體禮物交給「${studentName}」嗎？\n\n確認後將記錄領取日期及管理員操作紀錄。`
        )
      ) {
        return;
      }
    } else if (currentGift.status === "claimed") {
      if (
        !window.confirm(
          `「${studentName}」的 ${milestoneClasses} 堂禮物已標記為「已領取」。\n\n確定要更改為「${GIFT_STATUS_LABELS[nextStatus]}」嗎？\n\n系統會保留更正歷程。`
        )
      ) {
        return;
      }
    }

    const savingKey = `${userId}_${milestoneClasses}`;

    setGiftSavingKey(savingKey);
    setGiftErrors((previous) => ({
      ...previous,
      [userId]: "",
    }));

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("請先登入管理員帳號。");
      }

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/admin/journey/gifts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            milestoneClasses,
            status: nextStatus,
          }),
        }
      );

      const result: GiftResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "更新禮物狀態失敗。"
        );
      }

      await loadStudentGifts(userId);

      // 若操作歷程目前已展開，更新後同步重新讀取。
      if (expandedHistoryKeys.includes(savingKey)) {
        await loadGiftHistory(userId, milestoneClasses);
      } else {
        // 未展開的歷程也清除舊快取。
        setHistoryData((previous) => {
          const next = { ...previous };
          delete next[savingKey];
          return next;
        });
      }
    } catch (err) {
      setGiftErrors((previous) => ({
        ...previous,
        [userId]:
          err instanceof Error
            ? err.message
            : "更新禮物狀態失敗。",
      }));
    } finally {
      setGiftSavingKey(null);
    }
  }
async function reviewClaim(
  requestId: string,
  action: "approve" | "reject",
  legacyMemberId?: string
) {
  const user = auth.currentUser;

  if (!user) {
    setError("請先登入管理員帳號。");
    return;
  }

  if (action === "approve" && !legacyMemberId) {
    setError("請先選擇要移轉的舊會員。");
    return;
  }

  const actionLabel = action === "approve" ? "核准並移轉點數" : "拒絕申請";

  if (!window.confirm(`確定要${actionLabel}嗎？`)) {
    return;
  }

  setProcessingId(requestId);
  setError("");
  setMessage("");

  try {
    const token = await user.getIdToken();

    const response = await fetch(
      `/api/admin/legacy-claims/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId,
          ...(action === "approve" ? { legacyMemberId } : {}),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "審核失敗。");
    }

    setMessage(data.message ?? "審核完成。");
  } catch (err) {
    setError(err instanceof Error ? err.message : "審核失敗。");
  } finally {
    setProcessingId(null);
  }
}
  return (
    <section className="mt-8 rounded-3xl border border-sky-100 bg-white p-6 shadow-sm md:p-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
            MILESTONE REWARDS
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            🎓 里程碑獎勵管理
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-500">
            查看會員電子證書發證紀錄，
            並管理 100、300、500 堂實體禮物及操作歷程。
          </p>
        </div>

        <button
          type="button"
          disabled={loading || refreshing}
          onClick={() => void loadRewards(true)}
          className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
        >
          {refreshing ? "更新中……" : "↻ 更新資料"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">
          正在載入里程碑獎勵紀錄……
        </p>
      ) : (
        <>
          <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-sky-50 p-4">
              <p className="text-xs font-semibold text-sky-700">
                已發證書總數
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {totalCertificates}
              </p>
            </div>

            {LEVELS.map((level) => (
              <div
                key={level}
                className="rounded-2xl bg-slate-50 p-4"
              >
                <p className="text-xs font-semibold text-slate-600">
                  {MILESTONE_EMOJIS[level]} {level} 堂證書
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  {issuedCounts[level]}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-800">舊證書待補姓名</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{missingNameCount}</p>
              <button type="button" onClick={() => {
                setAttentionFilter("missing_name");
                setIssuedOnly(false);
              }} className="mt-2 text-xs font-semibold text-amber-800 underline">
                查看名單
              </button>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4">
              <p className="text-xs font-semibold text-sky-700">符合資格但尚未領取禮物</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {giftOverview.pending + giftOverview.notified}
              </p>
              <p className="mt-1 text-xs text-slate-500">含已通知；{giftDataComplete ? "全體已載入" : "目前僅計已載入會員"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-600">已通知待領取</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{giftOverview.notified}</p>
              <p className="mt-1 text-xs text-slate-500">{giftDataComplete ? "全體已載入" : "目前僅計已載入會員"}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-semibold text-emerald-700">已領取實體禮物</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{giftOverview.claimed}</p>
              <p className="mt-1 text-xs text-slate-500">{giftDataComplete ? "全體已載入" : "目前僅計已載入會員"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-sky-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">實體禮物統計範圍</p>
                <p className="mt-1 text-xs text-slate-500">
                  已載入 {Object.keys(giftData).length} / {students.length} 位會員。
                  {loadingAllGifts ? ` 本次批次已處理 ${allGiftProgress} 位。` : ""}
                  {allGiftErrors > 0 ? ` 有 ${allGiftErrors} 位讀取失敗，可重試。` : ""}
                </p>
              </div>
              <button type="button"
                disabled={loadingAllGifts || giftDataComplete || students.length === 0 || refreshing}
                onClick={() => void loadAllStudentGifts()}
                className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                {loadingAllGifts ? "正在載入全體禮物資料……" :
                  giftDataComplete ? "全體禮物資料已載入" : "載入全體禮物統計"}
              </button>
            </div>
            {!giftDataComplete && (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                禮物數字尚非全體統計。選擇「待領取／已領取」篩選前，建議先載入全體會員資料。
              </p>
            )}
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋會員姓名、暱稱或 Email"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
            />

            <select
              value={selectedLevel}
              onChange={(event) =>
                setSelectedLevel(
                  event.target.value as
                    | "all"
                    | "100"
                    | "300"
                    | "500"
                )
              }
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm"
            >
              <option value="all">全部里程碑</option>
              <option value="100">100 堂</option>
              <option value="300">300 堂</option>
              <option value="500">500 堂</option>
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={issuedOnly}
                onChange={(event) =>
                  setIssuedOnly(event.target.checked)
                }
              />
              僅顯示已發證
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="reward-attention-filter" className="text-sm font-semibold text-slate-700">
              快速篩選
            </label>
            <select id="reward-attention-filter" value={attentionFilter}
              onChange={(event) => setAttentionFilter(event.target.value as typeof attentionFilter)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
              <option value="all">全部會員</option>
              <option value="missing_name">已發證但缺少姓名</option>
              <option value="pending_gift">符合資格、尚未領取禮物</option>
              <option value="claimed_gift">已領取實體禮物</option>
            </select>
            {(attentionFilter === "pending_gift" || attentionFilter === "claimed_gift") && !giftDataComplete && (
              <span className="text-xs text-amber-700">目前只篩選已載入禮物資料的會員</span>
            )}
            {(attentionFilter !== "all" || search || issuedOnly || selectedLevel !== "all") && (
              <button type="button" onClick={() => {
                setSearch("");
                setSelectedLevel("all");
                setIssuedOnly(false);
                setAttentionFilter("all");
              }} className="text-sm font-semibold text-sky-700 underline">清除篩選</button>
            )}
          </div>

          <p className="mt-4 text-sm text-slate-500">
            顯示 {filteredStudents.length} 位會員，
            共 {students.length} 位會員。
          </p>

          <div className="mt-4 space-y-3">
            {filteredStudents.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                沒有符合條件的會員。
              </p>
            ) : (
              filteredStudents.map((student) => {
                const expanded = expandedUserIds.includes(
                  student.userId
                );

                const currentGiftData = giftData[student.userId];

                const loadingGifts = giftLoadingUserIds.includes(
                  student.userId
                );

                const relevantRewards = student.rewards.filter(
                  (reward) =>
                    selectedLevel === "all" ||
                    String(reward.milestoneClasses) === selectedLevel
                );

                return (
                  <article
                    key={student.userId}
                    className="overflow-hidden rounded-2xl border border-slate-200"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleExpanded(student.userId)
                      }
                      aria-expanded={expanded}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-sky-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {getStudentDisplayName(student)}
                        </p>

                        {student.nickname &&
                          student.nickname !== student.name && (
                            <p className="mt-1 text-xs text-slate-500">
                              暱稱：{student.nickname}
                            </p>
                          )}

                        <p className="mt-1 truncate text-xs text-slate-400">
                          {student.email}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                          {
                            relevantRewards.filter(
                              (reward) =>
                                reward.certificate.issued
                            ).length
                          }{" "}
                          張證書
                        </span>

                        <span className="text-slate-400">
                          {expanded ? "⌃" : "⌄"}
                        </span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                        {giftErrors[student.userId] && (
                          <p
                            role="alert"
                            className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
                          >
                            {giftErrors[student.userId]}
                          </p>
                        )}

                        {loadingGifts && (
                          <p className="mb-4 text-sm text-slate-500">
                            正在讀取實體禮物紀錄……
                          </p>
                        )}

                        {currentGiftData && (
                          <p className="mb-4 text-sm font-semibold text-sky-700">
                            實際累積完成：
                            {currentGiftData.completedClasses} 堂
                          </p>
                        )}

                        <div className="space-y-4">
                          {relevantRewards.map((reward) => {
                            const level = reward.milestoneClasses;

                            const gift = currentGiftData?.gifts.find(
                              (item) =>
                                item.milestoneClasses === level
                            );

                            const savingKey = `${student.userId}_${level}`;

                            const saving = giftSavingKey === savingKey;

                            const historyExpanded =
                              expandedHistoryKeys.includes(savingKey);

                            const historyLoading =
                              historyLoadingKeys.includes(savingKey);

                            const history = historyData[savingKey];

                            return (
                              <div
                                key={level}
                                className="rounded-2xl border border-slate-200 bg-white p-5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="font-bold text-slate-900">
                                    {MILESTONE_EMOJIS[level]}{" "}
                                    {level} 堂・
                                    {MILESTONE_NAMES[level]}
                                  </h3>

                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                      reward.certificate.issued
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >
                                    {reward.certificate.issued
                                      ? "已正式發證"
                                      : "尚未發證"}
                                  </span>
                                </div>

                                {reward.certificate.issued ? (
                                  <dl className="mt-4 space-y-2 text-sm">
                                    <div className="flex flex-wrap gap-2">
                                      <dt className="w-20 shrink-0 text-slate-500">
                                        證書姓名
                                      </dt>
                                      <dd className="text-slate-800">
                                        {reward.certificate
                                          .certificateName ||
                                          "舊證書未記錄姓名"}
                                      </dd>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <dt className="w-20 shrink-0 text-slate-500">
                                        證書編號
                                      </dt>
                                      <dd className="break-all font-mono text-xs text-slate-700">
                                        {reward.certificate
                                          .certificateNumber || "—"}
                                      </dd>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <dt className="w-20 shrink-0 text-slate-500">
                                        發證日期
                                      </dt>
                                      <dd className="text-slate-800">
                                        {reward.certificate.issueDate ||
                                          "—"}
                                      </dd>
                                    </div>
                                  </dl>
                                ) : (
                                  <p className="mt-3 text-sm text-slate-500">
                                    尚未正式領取電子證書。
                                  </p>
                                )}

                                <div className="mt-5 border-t border-slate-100 pt-4">
                                  <p className="text-sm font-bold text-slate-800">
                                    🎁 實體禮物
                                  </p>

                                  {!gift ? (
                                    <p className="mt-2 text-sm text-slate-400">
                                      {loadingGifts
                                        ? "讀取中……"
                                        : "尚未取得禮物資料"}
                                    </p>
                                  ) : (
                                    <>
                                      <p className="mt-2 text-xs text-slate-500">
                                        {gift.eligible
                                          ? "✓ 已達成領取資格"
                                          : "🔒 尚未達成領取資格"}
                                      </p>

                                      <div className="mt-3 flex flex-wrap items-center gap-3">
                                        <select
                                          aria-label={`${level} 堂禮物狀態`}
                                          value={gift.status}
                                          disabled={
                                            !gift.eligible ||
                                            saving ||
                                            giftSavingKey !== null ||
                                            loadingAllGifts
                                          }
                                          onChange={(event) => {
                                            const nextStatus =
                                              event.target.value;

                                            if (
                                              isGiftStatus(nextStatus)
                                            ) {
                                              void updateGiftStatus(
                                                student,
                                                level,
                                                nextStatus
                                              );
                                            }
                                          }}
                                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 disabled:opacity-50"
                                        >
                                          <option value="not_claimed">
                                            尚未領取
                                          </option>
                                          <option value="notified">
                                            已通知
                                          </option>
                                          <option value="claimed">
                                            已領取
                                          </option>
                                        </select>

                                        {saving && (
                                          <span className="text-xs text-sky-600">
                                            儲存中……
                                          </span>
                                        )}
                                      </div>

                                      {gift.status === "claimed" &&
                                        gift.claimedAt && (
                                          <p className="mt-3 text-sm text-emerald-700">
                                            ✓ 領取日期：
                                            {gift.claimedAt}
                                          </p>
                                        )}
                                    </>
                                  )}
                                </div>
{/* 實體禮物 LINE 通知 */}
{gift &&
  gift.eligible &&
  gift.status !== "claimed" && (
    <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-sky-800">
            💌 LINE 禮物領取通知
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            {gift.status === "notified"
              ? "此會員已標記為已通知，可再次複製訊息。"
              : "複製通知文字後，請自行透過 LINE 傳送給會員。"}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            gift.status === "notified"
              ? "bg-amber-100 text-amber-800"
              : "bg-white text-slate-600"
          }`}
        >
          {gift.status === "notified"
            ? "✓ 已通知"
            : "尚未通知"}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-sky-100 bg-white p-4">
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {createGiftNotificationMessage(
            getStudentDisplayName(student),
            level
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() =>
          void copyGiftNotification(student, level)
        }
        className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-700"
      >
        📋 複製 LINE 通知文字
      </button>

      {gift.status === "not_claimed" && (
        <button
          type="button"
          disabled={
            saving ||
            giftSavingKey !== null ||
            loadingAllGifts
          }
          onClick={() => {
            if (
              window.confirm(
                `確認已透過 LINE 或其他方式通知「${getStudentDisplayName(
                  student
                )}」領取 ${level} 堂實體禮物嗎？\n\n請確認訊息已實際傳送，再按確定。`
              )
            ) {
              void updateGiftStatus(
                student,
                level,
                "notified"
              );
            }
          }}
          className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
        >
          ✓ 我已傳送通知，標記為已通知
        </button>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-500">
        ※ 複製文字不會自動發送 LINE。
        通知狀態變更後，系統會保留管理員操作歷程。
      </p>
    </div>
  )}
                                {/* 操作歷程 */}
                                <div className="mt-5 border-t border-slate-100 pt-4">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleHistory(
                                        student.userId,
                                        level
                                      )
                                    }
                                    aria-expanded={historyExpanded}
                                    className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                                  >
                                    {historyExpanded
                                      ? "⌃ 收起操作歷程"
                                      : "⌄ 查看操作歷程"}
                                  </button>

                                  {historyExpanded && (
                                    <div className="mt-4">
                                      {historyLoading && (
                                        <p className="text-sm text-slate-500">
                                          正在讀取操作歷程……
                                        </p>
                                      )}

                                      {historyErrors[savingKey] && (
                                        <p
                                          role="alert"
                                          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
                                        >
                                          {historyErrors[savingKey]}
                                        </p>
                                      )}

                                      {!historyLoading &&
                                        !historyErrors[savingKey] &&
                                        history &&
                                        history.length === 0 && (
                                          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                                            目前沒有操作紀錄。
                                          </p>
                                        )}

                                      {!historyLoading &&
                                        history &&
                                        history.length > 0 && (
                                          <div className="space-y-3">
                                            {history.map((item) => (
                                              <div
                                                key={item.id}
                                                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                                              >
                                                <p className="text-sm font-semibold text-slate-800">
                                                  {
                                                    GIFT_STATUS_LABELS[
                                                      item.previousStatus
                                                    ]
                                                  }{" "}
                                                  →{" "}
                                                  {
                                                    GIFT_STATUS_LABELS[
                                                      item.newStatus
                                                    ]
                                                  }
                                                </p>

                                                <p className="mt-2 text-xs text-slate-500">
                                                  操作時間：
                                                  {formatHistoryTime(
                                                    item.updatedAt
                                                  )}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                  操作管理員：
                                                  {item.updatedByName ||
                                                    "未知管理員"}
                                                </p>

                                                {item.newStatus ===
                                                  "claimed" &&
                                                  item.claimedAt && (
                                                    <p className="mt-2 text-xs font-medium text-emerald-700">
                                                      禮物領取日期：
                                                      {item.claimedAt}
                                                    </p>
                                                  )}

                                                {item.previousStatus ===
                                                  "claimed" &&
                                                  item.newStatus !==
                                                    "claimed" && (
                                                    <p className="mt-2 text-xs text-amber-700">
                                                      此次操作更正了原本的已領取狀態。
                                                      {item.previousClaimedAt
                                                        ? ` 原領取日期：${item.previousClaimedAt}`
                                                        : ""}
                                                    </p>
                                                  )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <p className="mt-6 text-xs leading-6 text-slate-400">
            實體禮物資格依實際出席及歷史補登堂數計算。
            電子證書與實體禮物分開管理。
            每次禮物狀態變更都會保存管理員、操作時間及更正歷程。
          </p>
        </>
      )}
    </section>
  );
}
