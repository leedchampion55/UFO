import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/barlow-condensed/900.css";
import "@fontsource/permanent-marker";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: { default: "What the UFO?! | Strange Encounters of the Cornish Kind", template: "%s | What the UFO?!" },
  description: "A curious Cornish community for UFO sightings, paranormal experiences, unexplained encounters and strange stories.",
  metadataBase: new URL("https://whattheufo.example"),
  openGraph: { title: "What the UFO?!", description: "Strange Encounters of the Cornish Kind", images: ["/reference-artwork.png"] },
};

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#091620" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        <div id="main-content">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
