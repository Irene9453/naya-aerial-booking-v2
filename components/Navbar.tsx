import Image from "next/image";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-6 px-6">
       <a href="/" className="shrink-0">
  <Image
    src="/images/logo-3.png"
    alt="Naya Aerial"
    width={280}
    height={90}
    priority
    className="h-20 w-auto"
  />
</a>

        <nav className="flex items-center gap-4 text-sm sm:gap-6 sm:text-base">
          <a href="/" className="transition hover:text-sky-600">
            首頁
          </a>
          <a href="/courses" className="transition hover:text-sky-600">
            課程
          </a>
          <a href="/booking" className="transition hover:text-sky-600">
            預約
          </a>
          <a href="/login" className="transition hover:text-sky-600">
  登入
</a>
        </nav>
      </div>
    </header>
  );
}