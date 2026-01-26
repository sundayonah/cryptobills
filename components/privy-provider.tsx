// "use client";

// import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
// import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
// import { base, polygon } from "viem/chains";

// export function PrivyProvider({ children }: { children: React.ReactNode }) {
//   return (
//     <PrivyProviderBase
//       appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
// config={{
//   loginMethods: ["wallet", "email"],
//   embeddedWallets: {
//     ethereum: {
//       createOnLogin: "all-users" as const,
//     },
//   },
//         defaultChain: base,
//         supportedChains: [base, polygon],
//         appearance: {
//           theme: "light",
//           accentColor: "#676FFF",
//           landingHeader: "Log in or sign up",
//           logo: "/logos/cryptobilz-logo1.svg",
//         },
//       }}
//     >
//       <SmartWalletsProvider
//       >
//         {children}
//       </SmartWalletsProvider>
//     </PrivyProviderBase>
//   );
// }


"use client";

import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { base, polygon } from "viem/chains";

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProviderBase
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        loginMethods: ["wallet", "email"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users" as const,
          },
        },
        defaultChain: base,
        supportedChains: [base, polygon],
        appearance: {
          theme: "light",
          accentColor: "#676FFF",
          landingHeader: "Log in or sign up",
          logo: "/logos/cryptobilz-logo1.svg",
        },
      }}
    >
      <SmartWalletsProvider>
        {children}
      </SmartWalletsProvider>
    </PrivyProviderBase>
  );
}