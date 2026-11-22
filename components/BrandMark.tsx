import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-mark" aria-label="What the UFO?! home">
      <span className="brand-kicker">WHAT THE</span>
      <span className="brand-main">UFO?!</span>
      {!compact && <span className="brand-sub">Strange encounters · Cornwall</span>}
    </Link>
  );
}
