import { Link } from "react-router-dom";
import { SITE_INTRO_COPY } from "./siteIntro";

export function SiteBrandIntro() {
  return (
    <>
      <Link
        to="/"
        className="inline-block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cannes-ink)]"
        aria-label="Cannes Decoded home"
      >
        <img
          src="/cannes-logo.svg"
          alt=""
          className="h-9 w-auto max-w-full sm:h-10"
          style={{ filter: "brightness(0)" }}
        />
      </Link>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--color-cannes-muted)]">
        {SITE_INTRO_COPY}
      </p>
    </>
  );
}
