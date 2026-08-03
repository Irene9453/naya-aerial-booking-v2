"use client";

import { FormEvent, useState } from "react";

const courseOptions = [
  "低空瑜珈 Lv.0｜每週五 18:20",
  "空中瑜珈 Lv.0–1｜每週一 12:10",
  "空中瑜珈 Lv.0–1｜每週三 13:30",
  "空中瑜珈 Lv.0–1｜每週四 19:30",
  "空中瑜珈 Lv.1–2｜每週二 18:10",
  "空中瑜珈 Lv.1–2｜每週日 13:30",
  "空中瑜珈 Lv.3｜每週二 19:20",
  "空中瑜珈 Lv.3｜每週四 18:20",
  "舞綢 Lv.0–1｜每週日 15:20",
  "舞綢 Lv.0–1｜8/6（四）11:00",
  "舞綢 Lv.0–1｜8/20（四）11:00",
  "空環 Lv.0–1｜每週日 16:40",
];

export default function BookingForm() {
  const [submitted, setSubmitted] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function resetForm() {
    setSubmitted(false);
    setStudentName("");
    setSelectedCourse("");
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-sky-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-2xl text-sky-700">
          ✓
        </div>

        <h2 className="mt-5 text-2xl font-bold text-slate-900">
          已收到預約資料
        </h2>

        <p className="mt-4 leading-7 text-slate-600">
          謝謝你，{studentName}！
          <br />
          你選擇的是：
        </p>

        <p className="mt-3 font-semibold text-sky-700">
          {selectedCourse}
        </p>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          目前是網站測試版本，資料尚未存入系統。
          下一步會連接 Firebase。
        </p>

        <button
          type="button"
          onClick={resetForm}
          className="mt-7 rounded-xl border border-sky-600 px-6 py-3 font-semibold text-sky-700 transition hover:bg-sky-50"
        >
          填寫另一筆預約
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-2xl rounded-3xl border border-sky-100 bg-white p-7 shadow-sm md:p-10"
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* 姓名 */}
        <div>
          <label
            htmlFor="studentName"
            className="mb-2 block font-semibold text-slate-800"
          >
            姓名
            <span className="ml-1 text-orange-600">*</span>
          </label>

          <input
            id="studentName"
            name="studentName"
            type="text"
            required
            value={studentName}
            onChange={(event) => setStudentName(event.target.value)}
            placeholder="請輸入姓名"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/* 電話 */}
        <div>
          <label
            htmlFor="phone"
            className="mb-2 block font-semibold text-slate-800"
          >
            聯絡電話
            <span className="ml-1 text-orange-600">*</span>
          </label>

          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="例如：0912-345-678"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      {/* 課程 */}
      <div className="mt-6">
        <label
          htmlFor="course"
          className="mb-2 block font-semibold text-slate-800"
        >
          預約課程
          <span className="ml-1 text-orange-600">*</span>
        </label>

        <select
          id="course"
          name="course"
          required
          value={selectedCourse}
          onChange={(event) => setSelectedCourse(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="">請選擇課程與時段</option>

          {courseOptions.map((course) => (
            <option key={course} value={course}>
              {course}
            </option>
          ))}
        </select>
      </div>

      {/* 經驗 */}
      <div className="mt-6">
        <label
          htmlFor="experience"
          className="mb-2 block font-semibold text-slate-800"
        >
          空中運動經驗
          <span className="ml-1 text-orange-600">*</span>
        </label>

        <select
          id="experience"
          name="experience"
          required
          defaultValue=""
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="" disabled>
            請選擇目前經驗
          </option>
          <option value="第一次體驗">第一次體驗</option>
          <option value="未滿三個月">未滿三個月</option>
          <option value="三個月至一年">三個月至一年</option>
          <option value="一年以上">一年以上</option>
        </select>
      </div>

      {/* 備註 */}
      <div className="mt-6">
        <label
          htmlFor="note"
          className="mb-2 block font-semibold text-slate-800"
        >
          備註
        </label>

        <textarea
          id="note"
          name="note"
          rows={4}
          placeholder="可填寫身體狀況、學習需求或想詢問的事項"
          className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </div>

      {/* 同意事項 */}
      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-sky-50 p-4">
        <input
          type="checkbox"
          required
          className="mt-1 h-4 w-4 accent-sky-600"
        />

        <span className="text-sm leading-6 text-slate-600">
          我確認填寫資料正確，並了解送出預約不代表已完成保留，
          須等待老師確認。
        </span>
      </label>

      <button
        type="submit"
        className="mt-7 w-full rounded-xl bg-sky-600 px-6 py-3.5 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700"
      >
        送出預約
      </button>
    </form>
  );
}