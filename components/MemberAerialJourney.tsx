
"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { AERIAL_MILESTONES } from "@/lib/aerialJourney";
import AerialMilestoneCard from "@/components/AerialMilestoneCard";
import AerialCertificate from "@/components/AerialCertificate";

type Milestone = (typeof AERIAL_MILESTONES)[number];
type CertificateLevel = 100 | 300 | 500;

type JourneySummary = {
  success: boolean;
  legacyClasses: number;
  systemClasses: number;
  completedClasses: number;
};

type IssuedCertificate = {
  milestoneClasses: CertificateLevel;
  certificateNumber: string;
  issueDate: string;
  certificateName: string | null;
  needsNameConfirmation?: boolean;
};

type CertificateApiResponse = {
  success?: boolean;
  certificate?: IssuedCertificate | null;
  error?: string;
};

type Props = {
  studentName: string;
};

function isCertificateLevel(
  classes: number
): classes is CertificateLevel {
  return classes === 100 || classes === 300 || classes === 500;
}

function getCertificateName(
  certificate: IssuedCertificate,
  fallbackName: string
) {
  // 相容新增姓名鎖定功能之前已發出的證書
  return certificate.certificateName?.trim() || fallbackName;
}

export default function MemberAerialJourney({
  studentName,
}: Props) {
  const [summary, setSummary] =
    useState<JourneySummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedMilestone, setSelectedMilestone] =
    useState<Milestone | null>(null);

  const [selectedCertificate, setSelectedCertificate] =
    useState<IssuedCertificate | null>(null);

  const [loadingCertificate, setLoadingCertificate] =
    useState<CertificateLevel | null>(null);

  const [certificateError, setCertificateError] =
    useState("");

  const [pendingCertificate, setPendingCertificate] =
    useState<CertificateLevel | null>(null);

  const [certificateNameInput, setCertificateNameInput] =
    useState("");

  const [isLegacyCertificateBackfill, setIsLegacyCertificateBackfill] =
    useState(false);

  const [celebrationMilestone, setCelebrationMilestone] =
    useState<Milestone | null>(null);

  const [savingCelebration, setSavingCelebration] =
    useState(false);

  const [celebrationError, setCelebrationError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadJourney() {
      try {
        const user = auth.currentUser;

        if (!user) {
          throw new Error("請先登入會員帳號。");
        }

        const token = await user.getIdToken();

        const response = await fetch(
          "/api/member/journey/summary",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ?? "無法取得空中旅程資料。"
          );
        }

        if (cancelled) return;

        setSummary(result as JourneySummary);

        const celebrationResponse = await fetch(
          "/api/member/journey/celebrate",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!celebrationResponse.ok) {
          console.error("無法讀取 Firebase 慶祝紀錄");
          return;
        }

        const celebrationResult =
          await celebrationResponse.json();

        if (cancelled || !celebrationResult.success) {
          return;
        }

        const completed = Number(
          result.completedClasses ?? 0
        );

        const unlocked = AERIAL_MILESTONES.filter(
          (milestone) =>
            completed >= milestone.classes
        );

        const latestMilestone = unlocked.at(-1);

        if (!latestMilestone) return;

        const celebrated: number[] = Array.isArray(
          celebrationResult.celebratedMilestones
        )
          ? celebrationResult.celebratedMilestones
          : [];

        if (
          celebrated.includes(latestMilestone.classes)
        ) {
          return;
        }

        const storageKey =
          `naya-aerial-celebrated-${user.uid}-${latestMilestone.classes}`;

        let locallyCelebrated = false;

        try {
          locallyCelebrated =
            window.localStorage.getItem(storageKey) ===
            "true";
        } catch {
          // 以 Firebase 紀錄為準
        }

        if (locallyCelebrated) {
          try {
            const syncResponse = await fetch(
              "/api/member/journey/celebrate",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  milestoneClasses:
                    latestMilestone.classes,
                }),
              }
            );

            if (!syncResponse.ok) {
              console.error(
                "同步舊版慶祝紀錄失敗"
              );
            }
          } catch (syncError) {
            console.error(
              "同步慶祝紀錄失敗：",
              syncError
            );
          }

          return;
        }

        if (!cancelled) {
          setCelebrationMilestone(latestMilestone);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "讀取空中旅程失敗。"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadJourney();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCelebration(): Promise<boolean> {
    const milestone = celebrationMilestone;

    if (!milestone || savingCelebration) {
      return false;
    }

    setSavingCelebration(true);
    setCelebrationError("");

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error(
          "登入已失效，請重新登入。"
        );
      }

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/member/journey/celebrate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            milestoneClasses: milestone.classes,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "儲存慶祝紀錄失敗。"
        );
      }

      try {
        const storageKey =
          `naya-aerial-celebrated-${user.uid}-${milestone.classes}`;

        window.localStorage.setItem(
          storageKey,
          "true"
        );
      } catch {
        // 本機儲存失敗不影響 Firebase
      }

      setCelebrationMilestone(null);
      return true;
    } catch (err) {
      setCelebrationError(
        err instanceof Error
          ? err.message
          : "儲存慶祝紀錄失敗，請再試一次。"
      );
      return false;
    } finally {
      setSavingCelebration(false);
    }
  }

  async function openCelebrationCard() {
    const milestone = celebrationMilestone;

    if (!milestone) return;

    const saved = await saveCelebration();

    if (saved) {
      setSelectedMilestone(milestone);
    }
  }

  // 查詢是否已正式發證
  async function openCertificate(
    milestoneClasses: CertificateLevel
  ) {
    if (loadingCertificate !== null) return;

    setCertificateError("");
    setSelectedCertificate(null);
    setPendingCertificate(null);
    setIsLegacyCertificateBackfill(false);
    setLoadingCertificate(milestoneClasses);

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("請先登入會員帳號。");
      }

      const token = await user.getIdToken();

      const response = await fetch(
        `/api/member/journey/certificate?milestoneClasses=${milestoneClasses}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      const result: CertificateApiResponse =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "無法讀取電子證書，請稍後再試。"
        );
      }

      if (result.certificate) {
        const certificate = result.certificate;

        if (
          certificate.milestoneClasses !== milestoneClasses ||
          !certificate.certificateNumber ||
          !certificate.issueDate
        ) {
          throw new Error("電子證書資料不完整。");
        }

        // 舊證書已發出，但沒有鎖定姓名：先進行一次性補登。
        if (
          certificate.needsNameConfirmation === true ||
          !certificate.certificateName?.trim()
        ) {
          setCertificateNameInput(studentName.trim());
          setIsLegacyCertificateBackfill(true);
          setPendingCertificate(milestoneClasses);
          return;
        }

        setSelectedCertificate(certificate);
        return;
      }

      // 尚未發證：請會員確認姓名
      setIsLegacyCertificateBackfill(false);
      setCertificateNameInput(studentName.trim());
      setPendingCertificate(milestoneClasses);
    } catch (err) {
      setCertificateError(
        err instanceof Error
          ? err.message
          : "開啟電子證書失敗，請再試一次。"
      );
    } finally {
      setLoadingCertificate(null);
    }
  }

  // 確認姓名後才正式發證
  async function confirmCertificateName() {
    const milestoneClasses = pendingCertificate;

    if (
      milestoneClasses === null ||
      loadingCertificate !== null
    ) {
      return;
    }

    const certificateName = certificateNameInput
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ");

    if (
      !certificateName ||
      Array.from(certificateName).length > 60 ||
      /[\u0000-\u001F\u007F]/.test(certificateName)
    ) {
      setCertificateError(
        "請輸入有效的證書姓名，最多 60 個字元。"
      );
      return;
    }

    setCertificateError("");
    setLoadingCertificate(milestoneClasses);

    try {
      const user = auth.currentUser;

      if (!user) {
        throw new Error("請先登入會員帳號。");
      }

      const token = await user.getIdToken();

      const response = await fetch(
        "/api/member/journey/certificate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            milestoneClasses,
            certificateName,
          }),
          cache: "no-store",
        }
      );

      const result: CertificateApiResponse =
        await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "正式發證失敗，請稍後再試。"
        );
      }

      const certificate = result.certificate;

      if (
        !certificate ||
        certificate.milestoneClasses !== milestoneClasses ||
        !certificate.certificateNumber ||
        !certificate.issueDate ||
        !certificate.certificateName?.trim()
      ) {
        throw new Error("電子證書資料不完整。");
      }

      setSelectedCertificate(certificate);
      setPendingCertificate(null);
      setIsLegacyCertificateBackfill(false);
      setCertificateNameInput("");
    } catch (err) {
      setCertificateError(
        err instanceof Error
          ? err.message
          : "正式發證失敗，請再試一次。"
      );
    } finally {
      setLoadingCertificate(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm">
        <p className="text-sm text-slate-500">
          正在載入你的空中旅程……
        </p>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">
          🪽 我的空中旅程
        </h2>
        <p className="mt-3 text-sm text-rose-600">
          {error || "無法取得空中旅程資料。"}
        </p>
      </section>
    );
  }

  const completedClasses = summary.completedClasses;

  const unlockedMilestones =
    AERIAL_MILESTONES.filter(
      (milestone) =>
        completedClasses >= milestone.classes
    );

  const nextMilestone =
    AERIAL_MILESTONES.find(
      (milestone) =>
        completedClasses < milestone.classes
    );

  const previousThreshold =
    unlockedMilestones.length > 0
      ? unlockedMilestones[
          unlockedMilestones.length - 1
        ].classes
      : 0;

  const progress = nextMilestone
    ? Math.min(
        100,
        Math.max(
          0,
          ((completedClasses - previousThreshold) /
            (nextMilestone.classes -
              previousThreshold)) *
            100
        )
      )
    : 100;

  return (
    <section className="mt-8 rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-9">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">
        MY AERIAL JOURNEY
      </p>

      <h2 className="mt-2 text-2xl font-bold text-slate-900">
        🪽 我的空中旅程
      </h2>

      <p className="mt-3 text-sm text-slate-500">
        每一次練習，都是讓自己更靠近天空的一步。
      </p>

      {/* 累積堂數 */}
      <div className="mt-6 rounded-2xl bg-gradient-to-br from-sky-50 to-white p-5 ring-1 ring-sky-100">
        <p className="text-sm font-semibold text-sky-700">
          累積完成堂數
        </p>

        <p className="mt-2 text-4xl font-bold text-slate-900">
          {completedClasses}
          <span className="ml-2 text-base font-normal text-slate-500">
            堂
          </span>
        </p>

        {nextMilestone ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-700">
                下一站：{nextMilestone.emoji}{" "}
                {nextMilestone.name}
              </span>

              <span className="text-slate-500">
                還差{" "}
                {nextMilestone.classes -
                  completedClasses}{" "}
                堂
              </span>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm font-semibold text-sky-700">
            🌌 已解鎖全部里程碑！旅程仍會繼續。
          </p>
        )}
      </div>

      {/* 里程碑徽章 */}
      <div className="mt-7">
        <h3 className="text-lg font-bold text-slate-900">
          我的里程碑徽章
        </h3>

        <p className="mt-2 text-sm text-slate-500">
          點選已解鎖的徽章，製作你的專屬電子紀念卡。
          達成 100、300、500 堂還可另外領取電子證書。
        </p>

        {certificateError && pendingCertificate === null && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            <p>{certificateError}</p>
            <button
              type="button"
              onClick={() => setCertificateError("")}
              className="mt-2 font-semibold underline"
            >
              關閉訊息
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {AERIAL_MILESTONES.map((milestone) => {
            const unlocked =
              completedClasses >= milestone.classes;

            const hasCertificate =
              milestone.certificate &&
              isCertificateLevel(milestone.classes);

            return (
              <div
                key={milestone.classes}
                className={`rounded-2xl border p-4 text-center transition ${
                  unlocked
                    ? "border-sky-200 bg-sky-50 hover:border-sky-400"
                    : "border-slate-200 bg-slate-50 opacity-60"
                }`}
              >
                <div className="text-3xl">
                  {unlocked
                    ? milestone.emoji
                    : "🔒"}
                </div>

                <p className="mt-2 text-sm font-bold text-slate-800">
                  {milestone.name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {milestone.classes} 堂
                </p>

                {milestone.certificate && (
                  <p className="mt-2 text-xs font-semibold text-violet-600">
                    🎓 電子證書
                  </p>
                )}

                {milestone.reward === "gift" && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    🎁 精美小贈品
                  </p>
                )}

                {unlocked && (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedMilestone(milestone)
                      }
                      className="w-full rounded-xl border border-sky-200 bg-white px-2 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      ✨ 查看紀念卡
                    </button>

                    {hasCertificate && (
                      <button
                        type="button"
                        disabled={
                          loadingCertificate !== null
                        }
                        onClick={() =>
                          void openCertificate(
                            milestone.classes as CertificateLevel
                          )
                        }
                        className="w-full rounded-xl bg-gradient-to-r from-amber-100 to-yellow-50 px-2 py-2 text-xs font-bold text-amber-800 ring-1 ring-amber-200 transition hover:from-amber-200 hover:to-yellow-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {loadingCertificate ===
                        milestone.classes
                          ? "正在確認證書……"
                          : "🎓 查看電子證書"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-xs leading-5 text-slate-400">
        累積堂數以實際完成的課程為準，
        包含經老師確認的歷史上課紀錄。
        預約但未出席的課程不列入計算。
      </p>

      {/* 原本的電子紀念卡 */}
      {selectedMilestone && (
        <AerialMilestoneCard
          studentName={studentName}
          milestone={selectedMilestone}
          completedClasses={completedClasses}
          onClose={() =>
            setSelectedMilestone(null)
          }
        />
      )}

      {/* 已正式發證的電子證書 */}
      {selectedCertificate !== null && (
        <AerialCertificate
          studentName={getCertificateName(
            selectedCertificate,
            studentName
          )}
          completedClasses={completedClasses}
          milestoneClasses={
            selectedCertificate.milestoneClasses
          }
          certificateNumber={
            selectedCertificate.certificateNumber
          }
          issueDate={
            selectedCertificate.issueDate
          }
          onClose={() =>
            setSelectedCertificate(null)
          }
        />
      )}

      {/* 首次領證或舊證書姓名補登：姓名確認視窗 */}
      {pendingCertificate !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="certificate-name-title"
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/70 px-4 py-6"
        >
          <div className="w-full max-w-md rounded-3xl border border-sky-100 bg-white p-7 shadow-2xl">
            <p className="text-xs font-semibold tracking-[0.25em] text-sky-600">
              NAYA AERIAL
            </p>

            <h2
              id="certificate-name-title"
              className="mt-3 text-xl font-bold text-slate-900"
            >
              🎓 確認電子證書姓名
            </h2>

            <p className="mt-3 text-sm leading-7 text-slate-600">
              恭喜達成{" "}
              <span className="font-bold text-sky-700">
                {pendingCertificate} 堂
              </span>
              ！
              <br />
              請確認這張證書上要顯示的姓名。
            </p>

            <label
              htmlFor="certificate-name"
              className="mt-6 block text-sm font-semibold text-slate-700"
            >
              證書姓名
            </label>

            <input
              id="certificate-name"
              type="text"
              value={certificateNameInput}
              maxLength={60}
              disabled={loadingCertificate !== null}
              onChange={(event) => {
                setCertificateNameInput(
                  event.target.value
                );
                setCertificateError("");
              }}
              placeholder="請輸入中文或英文姓名"
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
            />

            <p className="mt-3 text-xs leading-6 text-amber-700">
              {isLegacyCertificateBackfill
                ? "補登姓名後將永久鎖定；原證書編號與發證日期維持不變。"
                : "請仔細確認姓名。正式發證後，這張證書的姓名、編號與發證日期將固定保存，無法自行修改。"}
            </p>

            {certificateError && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
              >
                {certificateError}
              </p>
            )}

            <button
              type="button"
              disabled={loadingCertificate !== null}
              onClick={() =>
                void confirmCertificateName()
              }
              className="mt-6 w-full rounded-2xl bg-sky-600 px-5 py-3.5 font-bold text-white transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60"
            >
              {loadingCertificate !== null
                ? isLegacyCertificateBackfill
                  ? "正在補登姓名……"
                  : "正在正式發證……"
                : isLegacyCertificateBackfill
                  ? "確認姓名並完成補登"
                  : "確認姓名並正式領取證書"}
            </button>

            <button
              type="button"
              disabled={loadingCertificate !== null}
              onClick={() => {
                setPendingCertificate(null);
                setIsLegacyCertificateBackfill(false);
                setCertificateNameInput("");
                setCertificateError("");
              }}
              className="mt-3 w-full rounded-xl px-5 py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60"
            >
              {isLegacyCertificateBackfill
                ? "取消，稍後再補登"
                : "取消，稍後再領取"}
            </button>
          </div>
        </div>
      )}

      {/* 原本的慶祝動畫 */}
      {celebrationMilestone && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="里程碑解鎖慶祝"
          className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/70 px-4 py-6"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-b from-white via-sky-50 to-sky-100 p-8 text-center shadow-2xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {[
                { left: "12%", top: "15%", delay: "0s" },
                { left: "82%", top: "12%", delay: "0.5s" },
                { left: "20%", top: "45%", delay: "1s" },
                { left: "88%", top: "58%", delay: "0.3s" },
                { left: "50%", top: "8%", delay: "0.8s" },
              ].map((star, index) => (
                <span
                  key={index}
                  className="absolute animate-pulse text-xl text-sky-400"
                  style={{
                    left: star.left,
                    top: star.top,
                    animationDelay: star.delay,
                    animationDuration: "2s",
                  }}
                >
                  ✦
                </span>
              ))}
            </div>

            <div className="relative">
              <p className="text-xs font-semibold tracking-[0.25em] text-sky-600">
                NAYA AERIAL
              </p>

              <p className="mt-2 text-xs tracking-[0.2em] text-slate-400">
                MY AERIAL JOURNEY
              </p>

              <div className="mt-8 text-7xl">
                {celebrationMilestone.emoji}
              </div>

              <p className="mt-6 text-sm font-semibold text-sky-600">
                ✨ NEW MILESTONE UNLOCKED ✨
              </p>

              <h2 className="mt-3 text-2xl font-bold text-slate-900">
                恭喜解鎖「{celebrationMilestone.name}」！
              </h2>

              <p className="mt-4 text-lg font-semibold text-sky-800">
                累積完成 {celebrationMilestone.classes} 堂
              </p>

              <p className="mt-5 text-sm leading-7 text-slate-500">
                每一次勇敢嘗試，
                <br />
                都讓你離天空更近一點。
                <br />
                這份成就，值得好好收藏。
              </p>

              {celebrationError && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-600"
                >
                  {celebrationError}
                </p>
              )}

              <button
                type="button"
                disabled={savingCelebration}
                onClick={() =>
                  void openCelebrationCard()
                }
                className="mt-8 w-full rounded-2xl bg-sky-600 px-6 py-4 font-semibold text-white shadow-lg shadow-sky-200 transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60"
              >
                {savingCelebration
                  ? "正在儲存紀錄……"
                  : "✨ 查看我的電子紀念卡"}
              </button>

              <button
                type="button"
                disabled={savingCelebration}
                onClick={() =>
                  void saveCelebration()
                }
                className="mt-4 text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60"
              >
                稍後再看
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
