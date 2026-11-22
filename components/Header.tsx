"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { MemberNav } from "./MemberNav";

const links = [
  ["/", "Home"],
  ["/encounters", "Encounters"],
  ["/matts-files", "Matt’s Files"],
  ["/mothership", "The Mothership"],
  ["/about", "About"],
] as const;

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <BrandMark compact />
        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">Toggle navigation</span>
          <span aria-hidden="true" className="menu-lines"><i /><i /><i /></span>
        </button>
        <nav id="primary-navigation" className={open ? "primary-nav is-open" : "primary-nav"} aria-label="Primary navigation">
          <div className="nav-links">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className={pathname === href ? "active" : undefined} onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
          </div>
          <div className="nav-actions">
            <MemberNav close={() => setOpen(false)} />
            <Link className="button button-small" href="/report" onClick={() => setOpen(false)}>Report an encounter</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
