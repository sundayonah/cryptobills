"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SUPPORTED_NETWORKS } from "@/lib/networks";
import { getTokenConfigForChain } from "@/lib/token-utils";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import type { SupportedToken } from "@/types";
import { Loader2, ArrowRight, Copy } from "lucide-react";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TransferModal({ isOpen, onClose }: TransferModalProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { client: smartWalletsClient } = useSmartWallets();
  const { toast } = useToast();

  // Get EOA wallet for direct transfers
  const eoaWallet = wallets.find(wallet => wallet.walletClientType === "privy" || wallet.connectorType === "injected");
  
  // Get EOA address for auto-fill
  const eoaAddress = getWalletAddressFromPrivyUser(user) || eoaWallet?.address || "";
  
  // Get smart wallet address
  const smartWalletAddress = smartWalletsClient?.account?.address || "";

  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferFrom, setTransferFrom] = useState<"eoa" | "smart">("eoa");

  // Get available tokens for selected network
  const availableTokens = selectedNetwork
    ? (["USDC", "USDT"] as SupportedToken[]).filter(token => {
        try {
          return getTokenConfigForChain(token, parseInt(selectedNetwork));
        } catch {
          return false;
        }
      })
    : [];

  const handleTransfer = async () => {
    if (!selectedNetwork || !selectedToken || !amount || !recipientAddress) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Check if we have the appropriate wallet
    if (transferFrom === "smart") {
      if (!smartWalletsClient?.account?.address) {
        toast({
          title: "Smart wallet not available",
          description: "Smart wallet is not initialized. Please ensure smart wallets are enabled in the dashboard and try signing in again.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate recipient address
      if (!recipientAddress || !recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
        toast({
          title: "Invalid recipient address",
          description: "Please enter a valid Ethereum address (0x...)",
          variant: "destructive",
        });
        return;
      }
    }

    if (transferFrom === "eoa" && !eoaWallet) {
      toast({
        title: "EOA wallet not available",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      const chainId = parseInt(selectedNetwork);
      const tokenConfig = getTokenConfigForChain(selectedToken as SupportedToken, chainId);

      if (!tokenConfig) {
        throw new Error(`Token ${selectedToken} not supported on this network`);
      }

      // Switch to the selected network
      if (transferFrom === "smart") {
        if (smartWalletsClient) {
          await smartWalletsClient.switchChain({ id: chainId });
          // Small delay to ensure chain switch propagates
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // For EOA, switch chain if needed
        if (eoaWallet) {
          const walletChainId = eoaWallet.chainId
            ? parseInt(eoaWallet.chainId.split(":")[1] || eoaWallet.chainId)
            : null;

          if (walletChainId !== chainId) {
            await eoaWallet.switchChain(chainId);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // Encode transfer data
      const transferAmount = parseUnits(amount, tokenConfig.decimals);
      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipientAddress as `0x${string}`, transferAmount],
      });

      let txHash: string;

      if (transferFrom === "smart") {
        // Execute transfer from smart wallet
        if (!smartWalletsClient) {
          throw new Error("Smart wallet client is not available");
        }
        
        toast({
          title: "Sending transaction",
          description: `Transferring ${amount} ${selectedToken} from smart wallet...`,
        });
        
        const txHashResponse = await smartWalletsClient.sendTransaction({
          to: tokenConfig.address as `0x${string}`,
          data: transferData,
          value: BigInt(0),
        });
        
        // Handle different return types
        txHash = typeof txHashResponse === 'string' 
          ? txHashResponse 
          : (txHashResponse as { hash?: string })?.hash || String(txHashResponse);
      } else {
        // Execute transfer from EOA using wallet provider
        if (!eoaWallet?.getEthereumProvider) {
          throw new Error("EOA wallet provider not available");
        }

        const provider = await eoaWallet.getEthereumProvider();

        // Send transaction using EIP-1193 provider
        txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: eoaWallet.address,
            to: tokenConfig.address,
            data: transferData,
            value: '0x0',
          }],
        });
      }

      toast({
        title: "Transfer successful!",
        description: `${amount} ${selectedToken} sent from ${transferFrom.toUpperCase()}. Tx: ${txHash.slice(0, 10)}...`,
      });

      // Reset form
      setAmount("");
      setRecipientAddress("");
      onClose();

    } catch (error: any) {
      toast({
        title: "Transfer failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedNetwork("");
      setSelectedToken("");
      setAmount("");
      setRecipientAddress("");
      setTransferFrom("eoa");
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Funds</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Transfer From Selector */}
          <div className="space-y-2">
            <Label>Transfer From</Label>
            <Select value={transferFrom} onValueChange={(value: "eoa" | "smart") => setTransferFrom(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select wallet type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eoa">EOA Wallet (Direct Transfer)</SelectItem>
                <SelectItem value="smart">Smart Wallet (Gas-free)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              {transferFrom === "eoa"
                ? "Direct transfer from your connected wallet (requires gas fees)"
                : "Transfer from smart wallet (gas fees sponsored)"}
            </p>
          </div>

          {/* Network Selector */}
          <div className="space-y-2">
            <Label htmlFor="network">Network</Label>
            <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
              <SelectTrigger>
                <SelectValue placeholder="Select network" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_NETWORKS.map((network) => (
                  <SelectItem key={network.id} value={network.id.toString()}>
                    {network.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Token Selector */}
          <div className="space-y-2">
            <Label htmlFor="token">Token</Label>
            <Select
              value={selectedToken}
              onValueChange={setSelectedToken}
              disabled={!selectedNetwork}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select token" />
              </SelectTrigger>
              <SelectContent>
                {availableTokens.map((token) => (
                  <SelectItem key={token} value={token}>
                    {token}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Recipient Address */}
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <div className="flex gap-2">
              <Input
                id="recipient"
                placeholder="0x..."
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="flex-1"
              />
              {transferFrom === "smart" && eoaAddress && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRecipientAddress(eoaAddress)}
                  className="whitespace-nowrap"
                  title="Use my EOA address"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  My EOA
                </Button>
              )}
            </div>
            {transferFrom === "smart" && eoaAddress && (
              <p className="text-xs text-gray-500">
                Transfer to your EOA: {eoaAddress.slice(0, 6)}...{eoaAddress.slice(-4)}
              </p>
            )}
          </div>
          
          {/* Smart Wallet Info */}
          {transferFrom === "smart" && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-800">
                <strong>From:</strong> {smartWalletAddress ? `${smartWalletAddress.slice(0, 6)}...${smartWalletAddress.slice(-4)}` : "Smart wallet (not initialized)"}
              </p>
              {smartWalletAddress && (
                <p className="text-xs text-blue-600 mt-1">
                  This transfer will use gas sponsorship if configured.
                </p>
              )}
            </div>
          )}

          {/* Transfer Button */}
          <Button
            onClick={handleTransfer}
            disabled={isTransferring || !selectedNetwork || !selectedToken || !amount || !recipientAddress}
            className="w-full"
          >
            {isTransferring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Transfer Funds
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}