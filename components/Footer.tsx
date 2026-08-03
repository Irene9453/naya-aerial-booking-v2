export default function Footer() {
  return (
    <footer className="border-t bg-white px-6 py-8 text-center">
      <p className="font-semibold text-slate-800">
        Naya Aerial
      </p>

      <p className="mt-2 text-sm text-slate-500">
        空中瑜珈・舞綢・空環
      </p>

      <p className="mt-5 text-sm text-slate-500">
        © {new Date().getFullYear()} Naya Aerial
      </p>
    </footer>
  );
}