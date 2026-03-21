/**
 * Network utility functions for logos and images
 */

import { SUPPORTED_NETWORKS, type Network } from "./networks";

/**
 * Get network logo path
 */
export function getNetworkLogoPath(network: Network | string | number): string {
  let networkName: string;

  if (typeof network === "string") {
    networkName = network.toLowerCase();
  } else if (typeof network === "number") {
    const foundNetwork = SUPPORTED_NETWORKS.find(n => n.id === network);
    networkName = foundNetwork ? foundNetwork.name.toLowerCase() : "ethereum";
  } else {
    networkName = network.name.toLowerCase();
  }

  // Map network names to logo file names
  const logoMap: Record<string, string> = {
    ethereum: "/logos/ethereum-logo.svg",
    polygon: "/logos/polygon-logo.svg",
    arbitrum: "/logos/arbitrum-one-logo.svg",
    base: "/logos/base-logo.svg",
    bsc: "/logos/bnb-smart-chain-logo.svg",
  };

  return logoMap[networkName] || "/logos/ethereum-logo.svg";
}

/**
 * Get token logo path
 */
export function getTokenLogoPath(token: "USDC" | "USDT"): string {
  const logoMap: Record<string, string> = {
    USDC: "/logos/usdc-logo.svg",
    USDT: "/logos/usdt-logo.svg",
  };
  return logoMap[token] || "/logos/usdc-logo.svg";
}
