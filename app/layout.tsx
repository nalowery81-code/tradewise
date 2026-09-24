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
  description: "Real Skills. Smart Solutions.",
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
      </body>
    </html>
  );
}
