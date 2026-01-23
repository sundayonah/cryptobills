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
import { Loader2, ArrowRight } from "lucide-react";
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

  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferFrom, setTransferFrom] = useState<"eoa" | "smart">("smart");

  // Get available tokens for selected network
  const availableTokens = selectedNetwork
    ? ["USDC", "USDT"].filter(token => {
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
    if (transferFrom === "smart" && !smartWalletsClient) {
      toast({
        title: "Smart wallet not available",
        description: "Please connect and initialize your smart wallet first",
        variant: "destructive",
      });
      return;
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
      const tokenConfig = getTokenConfigForChain(selectedToken, chainId);

      if (!tokenConfig) {
        throw new Error(`Token ${selectedToken} not supported on this network`);
      }

      // Switch to the selected network
      if (transferFrom === "smart") {
        await smartWalletsClient.switchChain({ id: chainId });
      } else {
        // For EOA, we'll assume they're already on the right network
        // In a production app, you'd want to prompt network switching
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
        txHash = await smartWalletsClient.sendTransaction({
          to: tokenConfig.address as `0x${string}`,
          data: transferData,
          value: BigInt(0),
        });
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
      setTransferFrom("smart");
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
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />
          </div>

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