"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProviderBase
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        loginMethods: ["wallet", "email"],
        embeddedWallets: {
          createOnLogin: "all-users", // Create embedded wallet for all users (including email)
        },
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          // logo: "", // Remove logo or set to a valid URL
        },
        // Privy supports all EVM chains by default, so no need to specify supportedChains
        // This prevents configuration errors with chain-specific settings
      }}
    >
      {children}
    </PrivyProviderBase>
  );
}
