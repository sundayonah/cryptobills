import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PrivyProvider } from "@/components/privy-provider";
import { BalanceProvider } from "@/contexts/balance-context";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "cryptobilz - Pay Utility Bills with Crypto",
  description: "Pay electricity, airtime, data bundle, cable TV, and more with USDC or USDT",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PrivyProvider>
          <BalanceProvider>
            {children}
            <Toaster />
          </BalanceProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
