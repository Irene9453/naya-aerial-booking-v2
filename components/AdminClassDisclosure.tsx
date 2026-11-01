"use client";
import { useState, type ReactNode } from "react";

// 開啟前不建立逐堂監聽；關閉後保留表單內容與操作訊息。
export default function AdminClassDisclosure({ title, children }: { title: string; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(false);
  return <details className="mt-2 border-t border-slate-100 pt-2" onToggle={event => { if (event.currentTarget.open) setHasOpened(true); }}>
    <summary className="cursor-pointer text-sm font-semibold text-sky-800">{title}</summary>
    {hasOpened && children}
  </details>;
}
