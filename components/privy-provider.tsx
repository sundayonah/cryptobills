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

        // Embedded wallet configuration for TEE environment
        // TEE (Trusted Execution Environment) is enabled in production dashboard
        embeddedWallets: {
          createOnLogin: "all-users",
          // CRITICAL: These settings fix "Recovery method not supported" error in production
          requireUserPasswordOnCreate: false, // Use automatic recovery instead of password
          noPromptOnSignature: false, // Allow transaction prompts
        },

        // Appearance
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          // logo: "",
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