import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RoomProvider } from "@/lib/RoomProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { DeviceNameGate } from "@/components/DeviceNameGate";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["500", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "FileSync — fast, private file sharing between devices",
  description: "Share files directly between devices over a room code, a link, or the same WiFi network.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body text-ink antialiased">
        <ToastProvider>
          <RoomProvider>
            <DeviceNameGate>{children}</DeviceNameGate>
          </RoomProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
