import { SITE_INTRO_COPY } from "./siteIntro";

export function SiteBrandIntro() {
  return (
    <>
      <img
        src="/cannes-logo.svg"
        alt=""
        className="h-9 w-auto max-w-full sm:h-10"
        style={{ filter: "brightness(0)" }}
      />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--color-cannes-muted)]">
        {SITE_INTRO_COPY}
      </p>
    </>
  );
}
