import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revue des factures | GARNIER Industrie",
  description: "Consultez les factures extraites, les montants et les points à vérifier.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
