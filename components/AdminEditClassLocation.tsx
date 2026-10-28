"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const LOCATIONS = [
  "中山國小",
  "松江南京｜A 教室",
  "松江南京｜B 教室",
] as const;

type Props = {
  classId: string;
  location: string;
};

export default function AdminEditClassLocation({
  classId,
  location,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(location);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isEditing) {
      setSelectedLocation(location);
    }
  }, [location, isEditing]);

  async function handleSave() {
    if (!LOCATIONS.some((item) => item === selectedLocation)) {
      setMessage("請選擇上課地點。");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateDoc(doc(db, "classes", classId), {
        location: selectedLocation,
      });

      setIsEditing(false);
      setMessage("");
    } catch (error) {
      console.error("更新課程地點失敗：", error);
      setMessage("儲存失敗，請稍後再試。");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">
          📍 {location || "地點待確認"}
        </span>

        <button
          type="button"
          onClick={() => {
            setSelectedLocation(location);
            setMessage("");
            setIsEditing(true);
          }}
          className="rounded-lg border border-sky-200 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
        >
          修改地點
        </button>

        {message && (
          <p className="text-sm text-red-600">{message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        aria-label="上課地點"
        value={selectedLocation}
        onChange={(event) => {
          setSelectedLocation(event.target.value);
          setMessage("");
        }}
        disabled={isSaving}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value="">請選擇上課地點</option>
        {LOCATIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving || !selectedLocation}
        className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isSaving ? "儲存中..." : "儲存"}
      </button>

      <button
        type="button"
        onClick={() => {
          setIsEditing(false);
          setMessage("");
        }}
        disabled={isSaving}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        取消
      </button>

      {message && (
        <p className="text-sm text-red-600">{message}</p>
      )}
    </div>
  );
}