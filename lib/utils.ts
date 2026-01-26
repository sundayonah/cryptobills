import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize wallet address to lowercase for consistent database storage and queries
 * @param address - The wallet address to normalize
 * @returns Normalized wallet address (lowercase) or null if invalid
 */
export function normalizeWalletAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  
  // Remove whitespace and convert to lowercase
  const normalized = address.trim().toLowerCase();
  
  // Basic validation: should start with 0x and be 42 characters
  if (!normalized.startsWith('0x') || normalized.length !== 42) {
    return null;
  }
  
  return normalized;
}

/**
 * Copy text to clipboard
 * @param text - The text to copy
 * @returns Promise that resolves when text is copied
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        textArea.remove();
        return true;
      } catch (err) {
        textArea.remove();
        return false;
      }
    }
  } catch (err) {
    return false;
  }
}

/**
 * Get blockchain explorer link for a transaction
 * Only supports: Base, Polygon, Avalanche, Arbitrum
 * @param network - The network name (e.g., "Polygon", "Base", "Arbitrum", "Avalanche")
 * @param txHash - The transaction hash
 * @returns Explorer URL or null if network is not supported
 */
export function getExplorerLink(network: string | null | undefined, txHash: string | null | undefined): string | null {
  if (!network || !txHash) return null;

  const normalizedNetwork = network.trim();
  
  switch (normalizedNetwork) {
    case "Polygon":
      return `https://polygonscan.com/tx/${txHash}`;
    case "Base":
      return `https://basescan.org/tx/${txHash}`;
    case "Arbitrum":
    case "Arbitrum One":
      return `https://arbiscan.io/tx/${txHash}`;
    case "Avalanche":
      return `https://snowtrace.io/tx/${txHash}`;
    default:
      return null;
  }
}

/**
 * Check if network is supported for explorer links
 * @param network - The network name to check
 * @returns true if network is supported, false otherwise
 */
export function isSupportedNetwork(network: string | null | undefined): boolean {
  if (!network) return false;
  const normalizedNetwork = network.trim();
  return ["Polygon", "Base", "Arbitrum", "Arbitrum One", "Avalanche"].includes(normalizedNetwork);
}
