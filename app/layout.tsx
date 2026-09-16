import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { WalletProviders } from "../components/wallet/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Echo — Wallet AI Companion",
  description:
    "One wallet, one personal AI companion. Connect Phantom, start chatting.",
};

export const viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
