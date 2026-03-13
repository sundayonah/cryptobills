"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base, polygon, arbitrum } from "viem/chains";

export function Privy_Provider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        loginMethods: ["wallet", "email"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users" as const,
          },
        },
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
        },
        supportedChains: [base, polygon, arbitrum],
        defaultChain: base,
      }}
    >
      {children}
    </PrivyProvider>
  );
}