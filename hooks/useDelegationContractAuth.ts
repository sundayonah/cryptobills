"use client";

import { useSign7702Authorization } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import type { Address } from "viem";
import { getDelegationContractAddress } from "@/lib/bundler-config";

/**
 * Hook to sign EIP-7702 authorizations for the delegation contract.
 * Sign with the execution chainId so the account delegates to the contract on that chain.
 */
export function useDelegationContractAuth() {
  const { signAuthorization } = useSign7702Authorization();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (w) => w.connectorType === "embedded" || w.walletClientType === "privy"
  );

  const signDelegationAuthorization = useCallback(
    async (chainId: number): Promise<Record<string, unknown>> => {
      if (!embeddedWallet?.address) {
        throw new Error("Embedded wallet not ready for EIP-7702 signing");
      }
      const delegationAddress = getDelegationContractAddress(chainId);
      if (!delegationAddress || delegationAddress === "") {
        throw new Error(
          `Delegation contract not configured for chain ${chainId}. Add the contract for this chain.`
        );
      }
      const signed = await signAuthorization(
        {
          contractAddress: delegationAddress as `0x${string}`,
          chainId,
        },
        { address: embeddedWallet.address as Address }
      );
      return signed as Record<string, unknown>;
    },
    [signAuthorization, embeddedWallet?.address]
  );

  return { signDelegationAuthorization };
}
