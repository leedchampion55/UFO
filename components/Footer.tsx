import Link from "next/link";
import { BrandMark } from "./BrandMark";

const groups = [
  { title: "Explore", links: [["/encounters", "Encounters"], ["/matts-files", "Matt’s Files"], ["/mothership", "The Mothership"]] },
  { title: "About", links: [["/about", "Our story"], ["/contact", "Contact"], ["/guidelines", "Community guidelines"]] },
  { title: "The small print", links: [["/privacy", "Privacy"], ["/terms", "Terms"]] },
] as const;

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-beam" aria-hidden="true" />
      <div className="container footer-grid">
        <div className="footer-brand">
          <BrandMark />
          <p>A curious corner of the internet for strange Cornish encounters, unexplained stories and open-minded discussion.</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <p>© {new Date().getFullYear()} What the UFO?!</p>
        <p className="marker">Made on Earth. Possibly monitored elsewhere.</p>
      </div>
    </footer>
  );
}
