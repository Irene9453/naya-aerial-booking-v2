import LiveClassList from "@/components/LiveClassList";

export default function BookingPage() {
  return (
    <>
      {/* 頁首 */}
      <section className="bg-gradient-to-br from-sky-50 via-white to-blue-50 px-6 py-16 text-center md:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-sky-600">
          Class Schedule
        </p>

        <h1 className="mt-4 text-4xl font-bold text-slate-900 md:text-5xl">
          課程預約
        </h1>

        <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
          查看即時課程名額與所需點數，選擇適合自己的課程。
        </p>
      </section>

      {/* Firestore 即時課程 */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
            Live Schedule
          </p>

          <h2 className="mt-3 text-3xl font-bold text-slate-900">
            可預約課程
          </h2>

          <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">
            課程名額會即時更新。
          </p>
        </div>

        <LiveClassList />
      </section>
    </>
  );
}