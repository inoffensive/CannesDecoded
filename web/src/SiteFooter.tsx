export function SiteFooter({ narrow = false }: { narrow?: boolean }) {
  const max = narrow ? "max-w-5xl" : "max-w-6xl";
  return (
    <footer
      className={`mx-auto mt-16 ${max} px-4 pt-8 pb-8 text-xs text-[var(--color-cannes-muted)]`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <p className="text-left">
          © 2026 VML Portugal. Built for analysis — not affiliated with Cannes Lions.
        </p>
        <p className="text-left sm:text-right sm:shrink-0">
          Built on Cursor. Questions or requests?{" "}
          <a
            href="mailto:joao.rocha@vml.com"
            className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-950"
          >
            Email me
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
