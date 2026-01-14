"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { Loading } from "@/components/ui/loading";

export function WalletConnect() {
  const { ready, authenticated, login, user } = usePrivy();

  if (!ready) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Loading text="Connecting wallet..." size="sm" />
        </CardContent>
      </Card>
    );
  }

  if (authenticated && user?.wallet?.address) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Wallet Connected
            </CardTitle>
            <CardDescription>
              {user.wallet.address.slice(0, 6)}...{user.wallet.address.slice(-4)}
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Connect Your Wallet
          </CardTitle>
          <CardDescription>
            Connect your MetaMask, Trust Wallet, or other Web3 wallet to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={login} className="w-full" size="lg">
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
