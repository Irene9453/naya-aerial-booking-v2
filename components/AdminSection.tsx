"use client";

import { useState, type ReactNode } from "react";

type Props = { title: string; description?: string; count?: number; children: ReactNode };

export default function AdminSection({ title, description, count, children }: Props) {
  const [hasOpened, setHasOpened] = useState(false);
  return <details data-admin-section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    onToggle={event => { if (event.currentTarget.open) setHasOpened(true); }}>
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5 text-slate-900 marker:content-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-sky-600 md:px-7">
      <div><h2 className="text-lg font-bold">{title}{count !== undefined && <span className="ml-3 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">{count}</span>}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}</div>
      <span aria-hidden="true" className="flex items-center gap-2 text-sm font-semibold text-sky-800"><span className="admin-section-expand">展開</span><span className="admin-section-collapse">收合</span><svg className="admin-section-chevron h-5 w-5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m6 9 6 6 6-6" /></svg></span>
    </summary>
    {hasOpened && <div className="border-t border-slate-200 [&>article]:mt-0 [&>article]:rounded-none [&>article]:shadow-none [&>section]:mt-0 [&>section]:rounded-none [&>section]:shadow-none">{children}</div>}
  </details>;
}
