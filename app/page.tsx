import Image from "next/image";

const courses = [
  {
    title: "空中瑜珈",
    description:
      "分為初階、中階與進階，循序提升核心、柔軟度與身體控制能力。",
    image: "/images/yoga.jpg",
    alt: "Naya Aerial 空中瑜珈課程",
  },
  {
    title: "舞綢",
    description:
      "將舞蹈與空中藝術結合，感受布料流動與肢體延伸的優雅。",
    image: "/images/silk.jpg",
    alt: "Naya Aerial 舞綢課程",
  },
  {
    title: "空環",
    description:
      "挑戰力量、柔軟與技巧，享受旋轉與動作編排的樂趣。",
    image: "/images/hoop.jpg",
    alt: "Naya Aerial 空環課程",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-sky-50 via-white to-blue-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:grid-cols-2 md:gap-16 md:py-24">
          {/* 文字 */}
          <div className="text-center md:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-600">
              Naya Aerial
            </p>

            <h1 className="mt-5 text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
  Float with Strength.
  <span className="block text-sky-600">
    Find Yourself Within.
  </span>
</h1>

            <p className="mt-7 text-xl text-slate-600">
              空中瑜珈・舞綢・空環
            </p>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-500 md:mx-0">
              用飛翔找到力量，讓每一次練習都成為突破自己的開始。
            </p>
          </div>

          {/* 圖片：手機會排在文字後、按鈕前 */}
          <div className="mx-auto w-full max-w-md">
            <Image
              src="/images/hero.png"
              alt="Naya Aerial"
              width={900}
              height={1200}
              priority
              className="aspect-[4/5] w-full rounded-[2rem] object-cover object-center shadow-[0_20px_50px_rgba(14,165,233,0.16)]"
            />
          </div>

          {/* 按鈕：手機在照片下方，電腦移到左側文字下 */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center md:col-start-1 md:row-start-2 md:justify-start md:self-start">
            <a
              href="/booking"
              className="rounded-xl bg-sky-600 px-8 py-3.5 text-center font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
            >
              立即預約
            </a>

            <a
              href="/courses"
              className="rounded-xl border border-sky-600 px-8 py-3.5 text-center font-semibold text-sky-600 transition hover:-translate-y-0.5 hover:bg-sky-100"
            >
              查看課程
            </a>
          </div>
        </div>
      </section>

      {/* 課程介紹 */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Our Classes
          </p>

          <h2 className="mt-3 text-3xl font-bold text-slate-900 md:text-4xl">
            我們的課程
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {courses.map((course) => (
            <article
              key={course.title}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-2 hover:shadow-xl"
            >
              <div className="overflow-hidden">
                <Image
  src={course.image}
  alt={course.alt}
  width={800}
  height={1000}
  priority={course.title === "空環"}
  className="h-72 w-full object-cover transition duration-500 group-hover:scale-105"
/>
              </div>

              <div className="p-7">
                <h3 className="mb-3 text-2xl font-semibold text-sky-600">
                  {course.title}
                </h3>

                <p className="leading-7 text-slate-600">
                  {course.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}