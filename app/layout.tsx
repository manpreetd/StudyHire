import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyHire",
  description: "Autonomous exam-prep budget manager — visual receipt",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
