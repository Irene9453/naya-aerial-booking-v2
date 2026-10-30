
"use client";

import { useEffect, useRef, useState } from "react";

type CertificateLevel = 100 | 300 | 500;

type Props = {
  studentName: string;
  completedClasses: number;
  milestoneClasses: CertificateLevel;
  certificateNumber: string;
  issueDate: string;
  onClose: () => void;
};

const WIDTH = 3508;
const HEIGHT = 2480;

const FONT =
  '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

const BACKGROUND_PATHS: Record<CertificateLevel, string> = {
  100: "/images/aerial-certificate-100.png",
  300: "/images/aerial-certificate-300.png",
  500: "/images/aerial-certificate-500.png",
};

const LOGO_PATH = "/images/naya-aerial-logo.png";
const SIGNATURE_PATH = "/images/naya-certificate-signature.png";

const THEMES = {
  100: {
    name: "百堂星光",
    english: "SILVER ACHIEVEMENT",
    accent: "#B68D52",
    dark: "#34516A",
  },
  300: {
    name: "銀河漫遊",
    english: "CELESTIAL EXCELLENCE",
    accent: "#B68D52",
    dark: "#34516A",
  },
  500: {
    name: "無垠之翼",
    english: "INFINITE LEGACY",
    accent: "#B68D52",
    dark: "#34516A",
  },
} as const;

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minimumSize: number,
  weight = 600
) {
  let size = initialSize;

  while (size > minimumSize) {
    ctx.font = `${weight} ${size}px ${FONT}`;

    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }

    size -= 2;
  }

  ctx.font = `${weight} ${size}px ${FONT}`;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.15, -size * 0.15, size, 0);
  ctx.quadraticCurveTo(size * 0.15, size * 0.15, 0, size);
  ctx.quadraticCurveTo(-size * 0.15, size * 0.15, -size, 0);
  ctx.quadraticCurveTo(-size * 0.15, -size * 0.15, 0, -size);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawCertificate(
  canvas: HTMLCanvasElement,
  studentName: string,
  milestoneClasses: CertificateLevel,
  certificateNumber: string,
  issueDate: string,
  background: HTMLImageElement,
  logo: HTMLImageElement | null,
  signature: HTMLImageElement | null
) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("無法建立電子證書畫布。");
  }

  const theme = THEMES[milestoneClasses];

  // 背景等比例填滿 A4 橫式畫布
  const imageRatio =
    background.naturalWidth / background.naturalHeight;

  const canvasRatio = WIDTH / HEIGHT;

  let sx = 0;
  let sy = 0;
  let sw = background.naturalWidth;
  let sh = background.naturalHeight;

  if (imageRatio > canvasRatio) {
    sw = background.naturalHeight * canvasRatio;
    sx = (background.naturalWidth - sw) / 2;
  } else {
    sh = background.naturalWidth / canvasRatio;
    sy = (background.naturalHeight - sh) / 2;
  }

  ctx.drawImage(
    background,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    WIDTH,
    HEIGHT
  );

  // 保留原本證書的文字中心位置
  const centerX = milestoneClasses === 500 ? 1190 : 1250;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 品牌 Logo
  if (logo) {
    const logoWidth = 540;
    const logoHeight =
      logoWidth * (logo.naturalHeight / logo.naturalWidth);

    ctx.drawImage(
      logo,
      centerX - logoWidth / 2,
      180,
      logoWidth,
      logoHeight
    );
  } else {
    ctx.fillStyle = theme.dark;
    ctx.font = "600 65px Georgia, serif";
    ctx.fillText("NAYA AERIAL", centerX, 290);
  }

  // 品牌標語
  ctx.fillStyle = theme.dark;
  ctx.font = "400 34px Georgia, serif";
  ctx.fillText(
    "FLOAT WITH STRENGTH. FIND YOURSELF WITHIN.",
    centerX,
    430
  );

  // 主標題
  ctx.fillStyle = theme.accent;
  ctx.font = `500 ${milestoneClasses === 500 ? 126 : 137}px Georgia, serif`;
  ctx.fillText("CERTIFICATE", centerX, 615);

  ctx.fillStyle = theme.dark;
  ctx.font = "400 52px Georgia, serif";
  ctx.fillText(
    "O F   A C H I E V E M E N T",
    centerX,
    710
  );

  ctx.fillStyle = theme.accent;
  ctx.font = `600 57px ${FONT}`;
  ctx.fillText("空 中 旅 程 成 就 證 書", centerX, 805);

  // 標題裝飾
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(790, 875);
  ctx.lineTo(1710, 875);
  ctx.stroke();

  drawStar(ctx, centerX, 875, 18, theme.accent);

  // 授予文字
  ctx.fillStyle = "#6F8598";
  ctx.font = "italic 45px Georgia, serif";
  ctx.fillText(
    "This certificate is proudly presented to",
    centerX,
    975
  );

  // 會員姓名
  const name = studentName.trim() || "Aerial Explorer";

  ctx.fillStyle = theme.dark;
 fitFont(
  ctx,
  name,
  milestoneClasses === 500 ? 1378 : 1450,
  milestoneClasses === 500 ? 133 : 140,
  52,
  700
);
  ctx.fillText(name, centerX, 1110);

  // 姓名下方曲線
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(840, 1200);
  ctx.bezierCurveTo(
    1090,
    1240,
    1410,
    1240,
    1660,
    1200
  );
  ctx.stroke();

  // 成就描述
  ctx.fillStyle = theme.dark;
  ctx.font = `400 43px ${FONT}`;
  ctx.fillText(
    "以堅定、熱愛與持續不懈的努力，完成空中旅程",
    centerX,
    1320
  );

  ctx.fillStyle = "#74889A";
  ctx.font = "italic 33px Georgia, serif";
  ctx.fillText(
    "For showing up, flying higher, and growing stronger.",
    centerX,
    1390
  );

  // 完成堂數
  ctx.fillStyle = theme.accent;
  ctx.font = "500 255px Georgia, serif";
  ctx.fillText(
    String(milestoneClasses),
    centerX,
    1580
  );

  ctx.fillStyle = theme.dark;
  ctx.font = "500 40px Georgia, serif";
  ctx.fillText(
    "A E R I A L   C L A S S E S   C O M P L E T E D",
    centerX,
    1730
  );

  // 成就名稱：依 100 / 300 / 500 自動切換
  ctx.fillStyle = theme.dark;
  ctx.font = `700 65px ${FONT}`;
  ctx.fillText(theme.name, centerX, 1820);

  ctx.fillStyle = theme.accent;
  ctx.font = "500 41px Georgia, serif";
  ctx.fillText(theme.english, centerX, 1890);

  // 鼓勵文字
  ctx.fillStyle = "#617C91";
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(
    "在每一次練習中，看見更勇敢、更自由的自己。",
    centerX,
    1990
  );

  // 證書底部資訊
  const footerY = 2250;

  ctx.textAlign = "left";
  ctx.fillStyle = theme.dark;
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(
    `證書編號  ${certificateNumber}`,
    350,
    footerY
  );

  // Naya 藝術署名
  // 保留你先前調整完成的偏左位置
  if (signature) {
    const signatureWidth = 490;
    const signatureHeight =
      signatureWidth *
      (signature.naturalHeight / signature.naturalWidth);

    const signatureCenterX = WIDTH / 2 - 450;
    const signatureBottomY = 2350;

    ctx.drawImage(
      signature,
      signatureCenterX - signatureWidth / 2,
      signatureBottomY - signatureHeight,
      signatureWidth,
      signatureHeight
    );
  } else {
    // 署名圖片載入失敗時的備援文字
    const signatureCenterX = WIDTH / 2 - 450;

    ctx.textAlign = "center";
    ctx.fillStyle = theme.accent;
    ctx.font = "italic 75px Georgia, serif";
    ctx.fillText("Naya", signatureCenterX, 2180);

    ctx.fillStyle = theme.dark;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillText("娜婭", signatureCenterX, 2250);

    ctx.font = "italic 27px Georgia, serif";
    ctx.fillText("Instructor", signatureCenterX, 2300);
  }

  // 發證日期
  ctx.textAlign = "right";
  ctx.fillStyle = theme.dark;
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(
    `發證日期  ${issueDate}`,
    WIDTH - 350,
    footerY
  );
}

export default function AerialCertificate({
  studentName,
  completedClasses,
  milestoneClasses,
  certificateNumber,
  issueDate,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [background, setBackground] =
    useState<HTMLImageElement | null>(null);

  const [logo, setLogo] =
    useState<HTMLImageElement | null>(null);

  const [signature, setSignature] =
    useState<HTMLImageElement | null>(null);

  const [loadingImage, setLoadingImage] = useState(true);
  const [rendering, setRendering] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const unlocked = completedClasses >= milestoneClasses;

  // 依里程碑自動載入對應背景
  useEffect(() => {
    let disposed = false;

    const path = BACKGROUND_PATHS[milestoneClasses];
    const image = new Image();

    // 每次切換里程碑，清除上一張背景
    setBackground(null);
    setLoadingImage(true);
    setRendering(true);
    setError("");

    image.onload = () => {
      if (disposed) return;

      setBackground(image);
      setLoadingImage(false);
    };

    image.onerror = () => {
      if (disposed) return;

      setBackground(null);
      setError(
        `找不到證書背景，請確認 public${path} 已存在。`
      );
      setLoadingImage(false);
      setRendering(false);
    };

    image.src = path;

    return () => {
      disposed = true;
    };
  }, [milestoneClasses]);

  // 載入品牌 Logo
  useEffect(() => {
    let disposed = false;
    const image = new Image();

    image.onload = () => {
      if (!disposed) setLogo(image);
    };

    image.onerror = () => {
      console.warn("證書 Logo 載入失敗");
    };

    image.src = LOGO_PATH;

    return () => {
      disposed = true;
    };
  }, []);

  // 載入藝術署名
  useEffect(() => {
    let disposed = false;
    const image = new Image();

    image.onload = () => {
      if (!disposed) setSignature(image);
    };

    image.onerror = () => {
      console.warn(
        "藝術署名圖片載入失敗，將使用文字備援。"
      );
    };

    image.src = SIGNATURE_PATH;

    return () => {
      disposed = true;
    };
  }, []);

  // 繪製電子證書
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !unlocked || !background) {
      setRendering(false);
      return;
    }

    let disposed = false;

    async function render() {
      setRendering(true);

      try {
        if (document.fonts) {
          await document.fonts.ready;
        }

        if (disposed || !canvas || !background) return;

drawCertificate(
  canvas,
  studentName,
  milestoneClasses,
  certificateNumber,
  issueDate,
  background,
  logo,
  signature
);

        if (!disposed) {
          setError("");
        }
      } catch (err) {
        if (!disposed) {
          setError(
            err instanceof Error
              ? err.message
              : "電子證書製作失敗。"
          );
        }
      } finally {
        if (!disposed) {
          setRendering(false);
        }
      }
    }

    void render();

    return () => {
      disposed = true;
    };
  }, [
    studentName,
    milestoneClasses,
    certificateNumber,
    issueDate,
    background,
    logo,
    signature,
    unlocked,
  ]);

  // 下載 A4 橫式 PNG
  function download() {
    const canvas = canvasRef.current;

    if (
      !canvas ||
      !background ||
      !unlocked ||
      loadingImage ||
      rendering ||
      downloading ||
      error
    ) {
      return;
    }

    setDownloading(true);

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setError("圖片輸出失敗。");
          setDownloading(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download =
          `Naya-Aerial-${milestoneClasses}-Certificate.png`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);

        setDownloading(false);
      }, "image/png");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "下載失敗。"
      );
      setDownloading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${milestoneClasses}堂電子證書`}
      className="fixed inset-0 z-[160] flex items-center justify-center overflow-y-auto bg-slate-900/70 px-4 py-6"
    >
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-sky-600">
              NAYA AERIAL
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-900">
              🎓 {THEMES[milestoneClasses].name}・電子證書
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded-lg px-3 py-1 text-2xl text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        {!unlocked ? (
          <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            尚未完成 {milestoneClasses} 堂，
            暫時無法下載電子證書。
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-slate-500">
              這份證書記錄你在空中旅程中累積的努力與成長。
            </p>

            <div className="mt-5 flex justify-center rounded-2xl bg-slate-100 p-3">
              {loadingImage && (
                <p className="py-8 text-sm text-slate-500">
                  正在載入證書背景……
                </p>
              )}

              <canvas
                ref={canvasRef}
                aria-label={`${studentName}的電子證書預覽`}
                className={`h-auto w-full rounded-lg shadow-md ${
                  loadingImage || !background
                    ? "hidden"
                    : ""
                }`}
                style={{
                  aspectRatio: `${WIDTH} / ${HEIGHT}`,
                }}
              />
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              A4 橫式｜{WIDTH} × {HEIGHT} PNG
            </p>

            {error && (
              <p
                role="alert"
                className="mt-3 text-sm text-red-600"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700"
              >
                關閉
              </button>

              <button
                type="button"
                onClick={download}
                disabled={
                  loadingImage ||
                  rendering ||
                  downloading ||
                  !background ||
                  Boolean(error)
                }
                className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {loadingImage || rendering || downloading
                  ? "證書製作中……"
                  : "下載 PNG 電子證書"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
