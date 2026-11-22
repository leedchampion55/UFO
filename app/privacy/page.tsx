import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/LegalPlaceholder";
export const metadata: Metadata = { title: "Privacy" };
export default function PrivacyPage() { return <LegalPlaceholder type="Privacy" />; }
