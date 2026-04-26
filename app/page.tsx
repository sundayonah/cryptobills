"use client";

import { Header } from "@/components/header";
import SupportKitProvider from "@/components/supportkit-widget";
import { AirtimeSwapCard } from "@/components/airtime-swap-card";
import { TitleSkeleton } from "@/components/ui/loading";
import { motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";

export default function Home() {
  const { ready } = usePrivy();

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
              <span className="text-gray-900">Pay utility bills</span>
              <br />
              <span className="text-gray-600 italic font-serif">with stablecoins</span>
            </h1>
          </motion.div>
        )}

        <div className="max-w-lg mx-auto">
          <AirtimeSwapCard />
        </div>
      </main>
    </div>
  );
}
