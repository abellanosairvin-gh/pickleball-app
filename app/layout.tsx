import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Public_Sans } from "next/font/google";
import { PendingOverlay } from "@/components/PendingOverlay";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Pickleball Session Tracker",
  description: "Run a pickleball open-play session",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${dmSerif.variable} ${publicSans.variable}`}>
        {children}
        <PendingOverlay />
      </body>
    </html>
  );
}
