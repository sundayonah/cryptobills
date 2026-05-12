"use client";

import { Header } from "@/components/header";
import SupportKitProvider from "@/components/supportkit-widget";
import { AirtimeSwapCard } from "@/components/airtime-swap-card";
import { DepositFiatCard } from "@/components/deposit-fiat-card";
import { TitleSkeleton, ViewToggleSkeleton } from "@/components/ui/loading";
import { motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";

export default function Home() {
  const { ready } = usePrivy();
  const [activeView, setActiveView] = useState<"bills" | "deposit">("bills");

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SupportKitProvider />
      <Header />

      <main className="container mx-auto px-4 pt-32 md:pt-64 pb-12">
        {!ready ? (
          <TitleSkeleton />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8 md:mb-12"
          >
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              <span className="text-gray-900">
                {activeView === "bills" ? "Pay utility bills" : "Deposit fiat"}
              </span>
              <br />
              <span className="text-gray-600 italic font-serif">
                {activeView === "bills" ? "with stablecoins" : "to receive stablecoins"}
              </span>
            </h1>
          </motion.div>
        )}

        <div className="max-w-lg mx-auto space-y-4">
          {!ready ? (
            <ViewToggleSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveView("bills")}
                className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                  activeView === "bills"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                Pay Bilz
              </button>
              <button
                type="button"
                onClick={() => setActiveView("deposit")}
                className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                  activeView === "deposit"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                Deposit
              </button>
            </div>
          )}

          {activeView === "bills" ? <AirtimeSwapCard /> : <DepositFiatCard />}
        </div>
      </main>
    </div>
  );
}
