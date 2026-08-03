import Image from "next/image";

const courseGroups = [
  {
    title: "空中瑜珈",
    englishTitle: "Aerial Yoga",
    image: "/images/yoga.jpg",
    description:
      "透過吊床支撐身體，在安全且循序漸進的練習中，提升核心力量、柔軟度與身體控制。",
    levels: [
      {
        name: "低空瑜珈",
        detail: "Lv.0 入門推薦，低空練習更安心，適合第一次接觸空中運動的學員。",
      },
      {
        name: "空瑜 Lv.0–1",
        detail: "新手友善課程，建立基礎抓布、踩布與倒立觀念。",
      },
      {
        name: "空瑜 Lv.1–2",
        detail: "結合基礎與進階動作，逐步增加轉換、串連與動作變化。",
      },
      {
        name: "空瑜 Lv.3",
        detail: "進階技巧練習，著重力量、穩定度與流暢的動作串連。",
      },
    ],
  },
  {
    title: "舞綢",
    englishTitle: "Aerial Silk",
    image: "/images/silk.jpg",
    description:
      "將空中技巧與舞蹈表現結合，在布料的流動中練習攀爬、纏繞、旋轉與動作編排。",
    levels: [
      {
        name: "舞綢 Lv.0–1",
        detail: "從基礎抓布、踩布與簡單纏繞開始，建立舞綢所需的力量與安全觀念。",
      },
      {
        name: "舞綢進階",
        detail: "加入更多高度、旋轉、動作轉換及完整舞碼練習。",
      },
    ],
  },
  {
    title: "空環",
    englishTitle: "Aerial Hoop",
    image: "/images/hoop.jpg",
    description:
      "在圓形空環上練習坐姿、掛姿、旋轉與動作串連，同時訓練核心、上肢力量及平衡。",
    levels: [
      {
        name: "空環 Lv.0–1",
        detail: "適合初次接觸空環的學員，從安全上下環與基礎動作開始。",
      },
      {
        name: "空環進階",
        detail: "練習更多環上技巧、旋轉控制及具表演感的動作組合。",
      },
    ],
  },
];

export default function CoursesPage() {
  return (
    <>
      {/* 頁面標題 */}
      <section className="bg-gradient-to-br from-sky-50 via-white to-blue-50 px-6 py-16 text-center md:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-600">
          Our Classes
        </p>

        <h1 className="mt-4 text-4xl font-bold text-slate-900 md:text-5xl">
          找到適合你的空中課程
        </h1>

        <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
          從第一次接觸空中運動，到進階技巧與舞碼練習，
          依照自己的程度安心開始。
        </p>
      </section>

      {/* 課程內容 */}
      <section className="mx-auto max-w-6xl space-y-20 px-6 py-20">
        {courseGroups.map((course, index) => (
          <article
            key={course.title}
            className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
          >
            {/* 圖片 */}
            <div
              className={
                index % 2 === 1 ? "md:order-2" : ""
              }
            >
              <Image
                src={course.image}
                alt={`Naya Aerial ${course.title}課程`}
                width={900}
                height={1100}
                className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-lg"
              />
            </div>

            {/* 文字 */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">
                {course.englishTitle}
              </p>

              <h2 className="mt-3 text-3xl font-bold text-slate-900">
                {course.title}
              </h2>

              <p className="mt-5 leading-7 text-slate-600">
                {course.description}
              </p>

              <div className="mt-8 space-y-4">
                {course.levels.map((level) => (
                  <div
                    key={level.name}
                    className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5"
                  >
                    <h3 className="font-semibold text-sky-700">
                      {level.name}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {level.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* 預約按鈕 */}
      <section className="bg-sky-50 px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-slate-900">
          準備好開始飛翔了嗎？
        </h2>

        <p className="mt-4 text-slate-600">
          選擇適合自己的課程，開始你的空中練習。
        </p>

        <a
          href="/booking"
          className="mt-8 inline-block rounded-xl bg-sky-600 px-9 py-3.5 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
        >
          查看課表與預約
        </a>
      </section>
    </>
  );
}