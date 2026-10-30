"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

import {
  CONSENT_VERSION,
  CONSENT_TITLE,
  CONSENT_SECTIONS,
  CONSENT_CONFIRMATIONS,
} from "@/lib/consent";

export default function ConsentPage() {
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [studentName, setStudentName] = useState("");
  const [checked, setChecked] = useState<boolean[]>(
    CONSENT_CONFIRMATIONS.map(() => false)
  );

  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          router.replace("/login");
          return;
        }

        setUser(firebaseUser);
        setStudentName(firebaseUser.displayName ?? "");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [router]);

  // 設定簽名畫布，支援高解析度手機
  useEffect(() => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;

    canvas.width = 700 * ratio;
    canvas.height = 240 * ratio;

    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#334155";

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 700, 240);
  }, [loading]);

  function getPosition(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * 700,
      y: ((event.clientY - rect.top) / rect.height) * 240,
    };
  }

  function startDrawing(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    event.preventDefault();

    canvas.setPointerCapture(event.pointerId);

    const position = getPosition(event);

    context.beginPath();
    context.moveTo(position.x, position.y);

    drawingRef.current = true;
  }

  function draw(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!context) return;

    event.preventDefault();

    const position = getPosition(event);

    context.lineTo(position.x, position.y);
    context.stroke();

    hasSignatureRef.current = true;
    setHasSignature(true);
  }

  function stopDrawing() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.beginPath();

    hasSignatureRef.current = false;
    setHasSignature(false);
  }

  function toggleConfirmation(index: number) {
    setChecked((previous) =>
      previous.map((value, currentIndex) =>
        currentIndex === index ? !value : value
      )
    );
  }

  const allChecked = checked.every(Boolean);

  async function handleSubmit() {
    if (!user) {
      setMessage("請先登入會員帳號。");
      return;
    }

    if (!studentName.trim()) {
      setMessage("請填寫學員姓名。");
      return;
    }

    if (!allChecked) {
      setMessage("請先勾選全部確認事項。");
      return;
    }

    if (!hasSignatureRef.current) {
      setMessage("請先完成手寫簽名。");
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      setMessage("無法取得簽名資料，請重新整理頁面。");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const token = await user.getIdToken();

      const response = await fetch(
        "/api/member/consent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: studentName.trim(),
            version: CONSENT_VERSION,
            confirmations: checked,
            signature: canvas.toDataURL("image/png"),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "簽署失敗，請稍後再試。"
        );
      }

      router.replace("/member");
      router.refresh();
    } catch (error) {
      console.error("電子簽署失敗：", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "電子簽署失敗，請稍後再試。"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50 px-6 py-20 text-center text-slate-600">
        正在確認會員身分……
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-sky-50 px-4 py-10 sm:px-6 md:py-16">
      <div className="mx-auto max-w-4xl">
        {/* 標題 */}
        <div className="rounded-3xl bg-gradient-to-br from-sky-600 to-blue-500 px-6 py-10 text-center text-white shadow-lg sm:px-10">
          <p className="text-sm font-semibold tracking-[0.2em] text-sky-100">
            NAYA AERIAL
          </p>

          <h1 className="mt-4 text-2xl font-bold leading-relaxed sm:text-3xl">
            {CONSENT_TITLE}
          </h1>

          <p className="mt-4 text-sm leading-7 text-sky-100">
            歡迎加入 Naya Aerial！
            <br />
            為維護每位學員的上課權益與運動安全，
            請先閱讀以下內容並完成電子簽署。
          </p>

          <div className="mt-5 inline-block rounded-full bg-white/20 px-4 py-2 text-sm">
            文件版本 V{CONSENT_VERSION}
          </div>
        </div>

        {/* 同意書內容 */}
        <div className="mt-6 rounded-3xl border border-sky-100 bg-white p-6 shadow-sm sm:p-9">
          <div className="mb-7 border-b border-slate-100 pb-5">
            <h2 className="text-xl font-bold text-slate-900">
              📋 課程規範與安全須知
            </h2>

            <p className="mt-2 text-sm leading-7 text-slate-500">
              請仔細閱讀以下八條規範。
              完成簽署後，除非文件版本更新，
              否則不需要每次上課重新簽署。
            </p>
          </div>

          <div className="space-y-9">
            {CONSENT_SECTIONS.map((section) => (
              <article key={section.title}>
                <h3 className="border-l-4 border-sky-500 pl-4 text-lg font-bold text-sky-800">
                  {section.title}
                </h3>

                <div className="mt-5 space-y-3">
                  {section.paragraphs.map(
                    (paragraph, index) => (
                      <p
                        key={`${section.title}-${index}`}
                        className="whitespace-pre-wrap text-sm leading-8 text-slate-700 sm:text-base"
                      >
                        {paragraph}
                      </p>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 確認事項 */}
        <div className="mt-6 rounded-3xl border border-sky-100 bg-white p-6 shadow-sm sm:p-9">
          <h2 className="text-xl font-bold text-slate-900">
            ☑️ 學員確認事項
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-500">
            請確認你已閱讀並理解上述內容，
            再勾選以下事項。
          </p>

          <div className="mt-6 space-y-4">
            {CONSENT_CONFIRMATIONS.map(
              (confirmation, index) => (
                <label
                  key={index}
                  className="flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 p-4 transition hover:bg-sky-50"
                >
                  <input
                    type="checkbox"
                    checked={checked[index]}
                    onChange={() =>
                      toggleConfirmation(index)
                    }
                    className="mt-1 h-5 w-5 shrink-0 accent-sky-600"
                  />

                  <span className="text-sm leading-7 text-slate-700">
                    {confirmation}
                  </span>
                </label>
              )
            )}
          </div>
        </div>

        {/* 電子簽名 */}
        <div className="mt-6 rounded-3xl border border-sky-100 bg-white p-6 shadow-sm sm:p-9">
          <h2 className="text-xl font-bold text-slate-900">
            ✍️ 電子簽名
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-500">
            請輸入姓名，並使用手指或滑鼠在下方白色區域簽名。
          </p>

          <div className="mt-6">
            <label
              htmlFor="studentName"
              className="block text-sm font-semibold text-slate-700"
            >
              學員姓名
            </label>

            <input
              id="studentName"
              type="text"
              value={studentName}
              onChange={(event) =>
                setStudentName(event.target.value)
              }
              placeholder="請輸入真實姓名"
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-sky-500"
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              手寫簽名
            </p>

            <div className="overflow-hidden rounded-2xl border-2 border-dashed border-sky-200 bg-white">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                className="block h-[200px] w-full cursor-crosshair touch-none bg-white sm:h-[240px]"
                style={{
                  touchAction: "none",
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {hasSignature
                  ? "✓ 已完成簽名"
                  : "請在框內手寫簽名"}
              </p>

              <button
                type="button"
                onClick={clearSignature}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                清除重簽
              </button>
            </div>
          </div>

          {/* 錯誤訊息 */}
          {message && (
            <div
              role="alert"
              className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
            >
              {message}
            </div>
          )}

          <button
            type="button"
            disabled={
              submitting ||
              !studentName.trim() ||
              !allChecked ||
              !hasSignature
            }
            onClick={handleSubmit}
            className="mt-8 w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting
              ? "正在儲存簽署紀錄……"
              : "確認同意並完成電子簽署"}
          </button>

          <p className="mt-4 text-center text-xs leading-6 text-slate-500">
            送出後，系統將保存你的簽署紀錄、
            文件版本及簽署時間。
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Naya Aerial
          <br />
          Float with Strength. Find Yourself Within.
        </p>
      </div>
    </section>
  );
}