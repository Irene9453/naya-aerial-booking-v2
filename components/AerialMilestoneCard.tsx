
"use client";

import { useEffect, useRef, useState } from "react";

type Milestone = {
  classes: number;
  name: string;
  emoji: string;
  englishName?: string;
};

type Props = {
  studentName: string;
  milestone: Milestone;
  completedClasses: number;
  onClose: () => void;
};

type CardFormat = "story" | "square";

const FORMATS = {
  story: {
    width: 1080,
    height: 1920,
    label: "IG 限時動態 · 9:16",
  },
  square: {
    width: 1080,
    height: 1080,
    label: "IG 貼文 · 1:1",
  },
} as const;

const FONT =
  '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
  weight = 700
) {
  let size = preferredSize;

  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT}`;

    if (ctx.measureText(text).width <= maxWidth) {
      break;
    }

    size -= 2;
  }

  ctx.font = `${weight} ${size}px ${FONT}`;
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  format: CardFormat,
  zoom: number,
  positionX: number,
  positionY: number
) {
  const story = format === "story";

  const box = story
    ? { x: 140, y: 365, width: 800, height: 790 }
    : { x: 140, y: 205, width: 800, height: 385 };

  // Cover：照片會填滿區域，不會被拉伸變形。
  const baseScale = Math.max(
    box.width / image.naturalWidth,
    box.height / image.naturalHeight
  );

  const scale = baseScale * zoom;

  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;

  const extraX = Math.max(0, imageWidth - box.width);
  const extraY = Math.max(0, imageHeight - box.height);

  const drawX =
    box.x -
    extraX / 2 +
    (extraX / 2) * (positionX / 100);

  const drawY =
    box.y -
    extraY / 2 +
    (extraY / 2) * (positionY / 100);

  ctx.save();

  roundedRect(
    ctx,
    box.x,
    box.y,
    box.width,
    box.height,
    28
  );

  ctx.clip();

  ctx.drawImage(
    image,
    drawX,
    drawY,
    imageWidth,
    imageHeight
  );

  // 淡淡的品牌色濾鏡。
  const overlay = ctx.createLinearGradient(
    0,
    box.y,
    0,
    box.y + box.height
  );

  overlay.addColorStop(0, "rgba(232,245,253,0.03)");
  overlay.addColorStop(1, "rgba(49,108,148,0.13)");

  ctx.fillStyle = overlay;
  ctx.fillRect(
    box.x,
    box.y,
    box.width,
    box.height
  );

  ctx.restore();

  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 5;

  roundedRect(
    ctx,
    box.x,
    box.y,
    box.width,
    box.height,
    28
  );

  ctx.stroke();
}

function drawCard(
  canvas: HTMLCanvasElement,
  format: CardFormat,
  studentName: string,
  milestone: Milestone,
  photo: HTMLImageElement | null,
  zoom: number,
  positionX: number,
  positionY: number,
  logo: HTMLImageElement | null
) {
  const { width, height } = FORMATS[format];

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("瀏覽器無法建立圖片畫布。");
  }

  const story = format === "story";
  const hasPhoto = Boolean(photo);
  const centerX = width / 2;

  const y = (fraction: number) =>
    Math.round(height * fraction);

  // 天空藍漸層背景。
  const background = ctx.createLinearGradient(
    0,
    0,
    width,
    height
  );

  background.addColorStop(0, "#F9FCFF");
  background.addColorStop(0.48, "#E7F4FC");
  background.addColorStop(1, "#D4EAF7");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // 柔和光暈。
  ctx.save();
  ctx.globalAlpha = 0.45;

  const halo = ctx.createRadialGradient(
    840,
    y(0.2),
    30,
    840,
    y(0.2),
    480
  );

  halo.addColorStop(0, "#FFFFFF");
  halo.addColorStop(1, "#FFFFFF00");

  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();

  // 雙層銀白邊框。
  ctx.strokeStyle = "#B9D1E0";
  ctx.lineWidth = 2;

  roundedRect(
    ctx,
    58,
    58,
    width - 116,
    height - 116,
    36
  );

  ctx.stroke();

  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 3;

  roundedRect(
    ctx,
    75,
    75,
    width - 150,
    height - 150,
    28
  );

  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Naya Aerial 品牌 Logo
if (logo) {
  const logoWidth = story ? 400 : 190;
  const logoHeight =
    logoWidth * (logo.naturalHeight / logo.naturalWidth);

  ctx.drawImage(
    logo,
    centerX - logoWidth / 2,
    story ? 105 : 65,
    logoWidth,
    logoHeight
  );
} else {
  ctx.fillStyle = "#527F9D";
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(
    "N A Y A   A E R I A L",
    centerX,
    story ? 190 : 115
  );
}

ctx.fillStyle = "#527F9D";
ctx.font = `500 22px ${FONT}`;
ctx.fillText(
  "M Y   A E R I A L   J O U R N E Y",
  centerX,
  story ? 330 : 175
);

  if (photo) {
    // 有照片版本。
    drawPhoto(
      ctx,
      photo,
      format,
      zoom,
      positionX,
      positionY
    );

    ctx.fillStyle = "#234B68";

    fitFont(
      ctx,
      `${milestone.emoji} ${milestone.name}`,
      850,
      story ? 76 : 65,
      36
    );

    ctx.fillText(
      `${milestone.emoji} ${milestone.name}`,
      centerX,
      y(story ? 0.655 : 0.615)
    );

    if (milestone.englishName) {
      ctx.fillStyle = "#7298B1";

      fitFont(
        ctx,
        milestone.englishName.toUpperCase(),
        830,
        26,
        18,
        500
      );

      ctx.fillText(
        milestone.englishName.toUpperCase(),
        centerX,
        y(story ? 0.695 : 0.665)
      );
    }

    ctx.fillStyle = "#2B5775";
    ctx.font = `700 ${story ? 105 : 85}px ${FONT}`;

    ctx.fillText(
      String(milestone.classes),
      centerX,
      y(story ? 0.765 : 0.745)
    );

    ctx.fillStyle = "#688CA5";
    ctx.font = `600 25px ${FONT}`;

    ctx.fillText(
      "C L A S S E S   C O M P L E T E D",
      centerX,
      y(story ? 0.805 : 0.795)
    );

    ctx.fillStyle = "#3E6B89";

    fitFont(
      ctx,
      studentName.trim() || "Aerial Explorer",
      800,
      story ? 55 : 44,
      28,
      600
    );

    ctx.fillText(
      studentName.trim() || "Aerial Explorer",
      centerX,
      y(story ? 0.865 : 0.865)
    );
  } else {
    // 原本的無照片版本。
    ctx.fillStyle = "#638EAB";
    ctx.font = `400 ${story ? 125 : 92}px ${FONT}`;

    ctx.fillText(
      milestone.emoji,
      centerX,
      y(story ? 0.30 : 0.31)
    );

    ctx.fillStyle = "#234B68";

    fitFont(
      ctx,
      milestone.name,
      800,
      story ? 88 : 76,
      44
    );

    ctx.fillText(
      milestone.name,
      centerX,
      y(story ? 0.405 : 0.425)
    );

    if (milestone.englishName) {
      ctx.fillStyle = "#7298B1";

      fitFont(
        ctx,
        milestone.englishName.toUpperCase(),
        830,
        27,
        18,
        500
      );

      ctx.fillText(
        milestone.englishName.toUpperCase(),
        centerX,
        y(story ? 0.455 : 0.48)
      );
    }

    const dividerY = y(story ? 0.515 : 0.545);

    ctx.strokeStyle = "#A8C8DC";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(300, dividerY);
    ctx.lineTo(780, dividerY);
    ctx.stroke();

    ctx.fillStyle = "#2B5775";
    ctx.font = `700 ${story ? 118 : 96}px ${FONT}`;

    ctx.fillText(
      String(milestone.classes),
      centerX,
      y(story ? 0.60 : 0.64)
    );

    ctx.fillStyle = "#688CA5";
    ctx.font = `600 28px ${FONT}`;

    ctx.fillText(
      "C L A S S E S   C O M P L E T E D",
      centerX,
      y(story ? 0.652 : 0.70)
    );

    ctx.fillStyle = "#3E6B89";

    fitFont(
      ctx,
      studentName.trim() || "Aerial Explorer",
      800,
      story ? 55 : 46,
      28,
      600
    );

    ctx.fillText(
      studentName.trim() || "Aerial Explorer",
      centerX,
      y(story ? 0.75 : 0.79)
    );
  }

  // 底部文字。
  ctx.fillStyle = "#6D90A7";
  ctx.font = `400 ${story ? 29 : 24}px ${FONT}`;

  if (!hasPhoto) {
    ctx.fillText(
      "每一次練習，都是成長的印記",
      centerX,
      y(story ? 0.805 : 0.855)
    );
  }

  ctx.fillStyle = "#527F9D";
  ctx.font = `500 ${story ? 27 : 22}px ${FONT}`;

  ctx.fillText(
    "Float with Strength. Find Yourself Within.",
    centerX,
    y(story ? 0.94 : 0.91)
  );
}

export default function AerialMilestoneCard({
  studentName,
  milestone,
  completedClasses,
  onClose,
}: Props) {
  const [format, setFormat] =
    useState<CardFormat>("story");

  const [photo, setPhoto] =
    useState<HTMLImageElement | null>(null);
const [logo, setLogo] =
  useState<HTMLImageElement | null>(null);

useEffect(() => {
  const image = new Image();

  image.onload = () => setLogo(image);

  image.onerror = () => {
    console.warn("Naya Aerial Logo 載入失敗");
  };

  image.src = "/images/naya-aerial-logo.png";
}, []);
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);

  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [rendering, setRendering] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const unlocked =
    completedClasses >= milestone.classes;

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !unlocked) return;

    let disposed = false;

    async function render() {
      setRendering(true);

      try {
        if (document.fonts) {
          await document.fonts.ready;
        }

        if (disposed || !canvas) return;

        drawCard(
  canvas,
  format,
  studentName,
  milestone,
  photo,
  zoom,
  positionX,
  positionY,
  logo
);

        setError("");
      } catch (err) {
        if (!disposed) {
          setError(
            err instanceof Error
              ? err.message
              : "紀念卡產生失敗。"
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
    format,
    studentName,
    milestone,
    photo,
    zoom,
    positionX,
    positionY,
    unlocked,
    logo,
  ]);

  function handlePhotoChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("請選擇 JPG、PNG 或 WebP 圖片。");
      event.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("照片大小請勿超過 10 MB。");
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      if (!image.naturalWidth || !image.naturalHeight) {
        setError("無法讀取這張照片。");
        return;
      }

      setPhoto(image);
      setZoom(1);
      setPositionX(0);
      setPositionY(0);
      setError("");
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("照片載入失敗，請換一張試試。");
    };

    image.src = url;

    // 允許再次選擇同一張照片。
    event.target.value = "";
  }

  function removePhoto() {
    setPhoto(null);
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function resetPhotoPosition() {
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
  }

  function download() {
    const canvas = canvasRef.current;

    if (
      !canvas ||
      !unlocked ||
      downloading ||
      rendering ||
      error
    ) {
      return;
    }

    setDownloading(true);
    setError("");

    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setError("圖片輸出失敗，請再試一次。");
            setDownloading(false);
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");

          link.href = url;

          link.download =
            `Naya-Aerial-${milestone.classes}-classes-${format}.png`;

          document.body.appendChild(link);
          link.click();
          link.remove();

          window.setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 1000);

          setDownloading(false);
        },
        "image/png"
      );
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
      aria-label={`${milestone.name}電子紀念卡`}
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-slate-900/70 px-4 py-6"
    >
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-sky-600">
              NAYA AERIAL
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-900">
              {milestone.emoji} {milestone.name}・電子紀念卡
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
            尚未達成 {milestone.classes} 堂，
            暫時無法下載這張紀念卡。
          </p>
        ) : (
          <>
            {/* 尺寸切換 */}
            <div className="mt-5 flex flex-wrap gap-2">
              {(["story", "square"] as const).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFormat(option)}
                    aria-pressed={format === option}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                      format === option
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {FORMATS[option].label}
                  </button>
                )
              )}
            </div>

            {/* 照片功能 */}
            <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <h3 className="text-sm font-bold text-slate-800">
                📸 專屬照片
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                可選擇自己的空中運動照片，
                製作獨一無二的紀念卡。
                照片不會上傳至伺服器。
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
                aria-label="選擇紀念卡照片"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  {photo ? "更換照片" : "＋ 選擇照片"}
                </button>

                {photo && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
                  >
                    移除照片
                  </button>
                )}
              </div>

              {photo && (
                <div className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="photo-zoom"
                      className="flex justify-between text-sm font-medium text-slate-700"
                    >
                      <span>照片縮放</span>
                      <span>{zoom.toFixed(1)} 倍</span>
                    </label>

                    <input
                      id="photo-zoom"
                      type="range"
                      min="1"
                      max="3"
                      step="0.1"
                      value={zoom}
                      onChange={(e) =>
                        setZoom(Number(e.target.value))
                      }
                      className="mt-2 w-full accent-sky-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="photo-x"
                      className="text-sm font-medium text-slate-700"
                    >
                      左右調整
                    </label>

                    <input
                      id="photo-x"
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={positionX}
                      onChange={(e) =>
                        setPositionX(Number(e.target.value))
                      }
                      className="mt-2 w-full accent-sky-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="photo-y"
                      className="text-sm font-medium text-slate-700"
                    >
                      上下調整
                    </label>

                    <input
                      id="photo-y"
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={positionY}
                      onChange={(e) =>
                        setPositionY(Number(e.target.value))
                      }
                      className="mt-2 w-full accent-sky-600"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={resetPhotoPosition}
                    className="text-sm font-semibold text-sky-700 underline"
                  >
                    重設照片位置與縮放
                  </button>
                </div>
              )}
            </div>

            {/* 紀念卡預覽 */}
            <div className="mt-5 flex justify-center rounded-2xl bg-slate-100 p-4">
              <canvas
                ref={canvasRef}
                aria-label={`${studentName}的${milestone.name}紀念卡預覽`}
                className="h-auto max-h-[52vh] w-auto max-w-full rounded-lg shadow-md"
                style={{
                  aspectRatio:
                    `${FORMATS[format].width} / ${FORMATS[format].height}`,
                }}
              />
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              輸出尺寸：
              {FORMATS[format].width} ×{" "}
              {FORMATS[format].height} PNG
            </p>

            {error && (
              <p
                role="alert"
                className="mt-3 text-sm text-red-600"
              >
                {error}
              </p>
            )}

            {/* 下載按鈕 */}
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
                  downloading ||
                  rendering ||
                  Boolean(error)
                }
                className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {downloading || rendering
                  ? "圖片製作中……"
                  : "下載 PNG 紀念卡"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
