"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
import { base, arbitrum, polygon, avalanche } from "viem/chains";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProviderBase
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        // Login methods
        loginMethods: ["wallet", "email"],

        // Embedded wallet configuration
        // Recovery and TEE settings are configured in Privy Dashboard (Wallets → Advanced)
        // not in client-side code (those options are deprecated)
        embeddedWallets: {
          createOnLogin: "all-users", // Create embedded wallet for all users
          // Note: requireUserPasswordOnCreate and noPromptOnSignature are DEPRECATED
          // Configure recovery method and wallet UI settings in Privy Dashboard instead
        },

        // Appearance
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
        },

        // Network configuration - Support all networks
        defaultChain: base, // Base is default for gas sponsorship
        supportedChains: [
          base,      // Base (Chain ID: 8453)
          arbitrum,  // Arbitrum One (Chain ID: 42161)
          polygon,   // Polygon (Chain ID: 137)
          avalanche, // Avalanche C-Chain (Chain ID: 43114)
        ],
      }}
    >
      {children}
    </PrivyProviderBase>
  );
}