import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BrandLanguage from "./components/brand-language";
import ImpersonationBanner from "./components/impersonation-banner";
import SessionControls from "./components/session-controls";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CraftCompass AI",
  description: "AI support for skilled trade teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BrandLanguage />
        <ImpersonationBanner />
        <SessionControls />
        {children}
        <div
          aria-label="CraftCompass AI"
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 250,
            border: "1px solid #dbe2e8",
            borderRadius: 999,
            padding: "6px 10px",
            background: "rgba(255,255,255,0.94)",
            color: "#172033",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.01em",
            boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
            pointerEvents: "none",
          }}
        >
          CraftCompass AI
        </div>
      </body>
    </html>
  );
}
