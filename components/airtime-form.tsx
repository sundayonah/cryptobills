"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ethers } from "ethers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { TOKEN_CONFIGS, PAYMENT_RECIPIENT_ADDRESS, MIN_AMOUNT, MAX_AMOUNT } from "@/lib/constants";
import type { SupportedToken, AirtimeService } from "@/types";
import { motion } from "framer-motion";
import { Loader2, Send } from "lucide-react";

const airtimeSchema = z.object({
  token: z.enum(["USDC", "USDT"]),
  amount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= MIN_AMOUNT && num <= MAX_AMOUNT;
    },
    { message: `Amount must be between $${MIN_AMOUNT} and $${MAX_AMOUNT}` }
  ),
  phoneNumber: z.string().regex(/^0\d{10}$/, "Invalid Nigerian phone number"),
  service: z.enum(["mtn_vtu", "glo_vtu", "airtel_vtu", "9mobile_vtu"]),
});

type AirtimeFormData = z.infer<typeof airtimeSchema>;

interface ExchangeRate {
  usdcToNgn: number;
  usdtToNgn: number;
  timestamp: number;
}

export function AirtimeForm() {
  const { ready, authenticated, user } = usePrivy();
  const { toast } = useToast();
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ngnAmount, setNgnAmount] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AirtimeFormData>({
    resolver: zodResolver(airtimeSchema),
    defaultValues: {
      token: "USDC",
      amount: "1",
      service: "mtn_vtu",
    },
  });

  const selectedToken = watch("token");
  const selectedAmount = watch("amount");

  // Fetch exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const response = await fetch("/api/exchange-rate");
        const data = await response.json();
        setExchangeRate(data);
      } catch (error) {
        console.error("Error fetching exchange rate:", error);
      }
    };
    fetchRate();
    const interval = setInterval(fetchRate, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate NGN amount
  useEffect(() => {
    if (exchangeRate && selectedAmount) {
      const amount = parseFloat(selectedAmount);
      if (!isNaN(amount)) {
        const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
        setNgnAmount(Math.round(amount * rate));
      }
    }
  }, [selectedToken, selectedAmount, exchangeRate]);

  if (!ready || !authenticated || !user?.wallet?.address) {
    return null;
  }

  const onSubmit = async (data: AirtimeFormData) => {
    if (!PAYMENT_RECIPIENT_ADDRESS) {
      toast({
        title: "Configuration Error",
        description: "Payment recipient address is not configured",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Get provider from window.ethereum (MetaMask, etc.)
      if (!window.ethereum) {
        throw new Error("No wallet provider found. Please install MetaMask or another Web3 wallet.");
      }

      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await ethersProvider.getSigner();
      const tokenConfig = TOKEN_CONFIGS[data.token];

      // Create ERC20 contract instance
      const erc20Abi = [
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)",
      ];

      const tokenContract = new ethers.Contract(
        tokenConfig.address,
        erc20Abi,
        signer
      );

      // Convert amount to token units
      const amount = ethers.parseUnits(data.amount, tokenConfig.decimals);

      // Send transaction
      const tx = await tokenContract.transfer(PAYMENT_RECIPIENT_ADDRESS, amount);

      toast({
        title: "Transaction Sent",
        description: `Waiting for confirmation... ${tx.hash.slice(0, 10)}...`,
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        // Payment confirmed, now purchase airtime
        const purchaseResponse = await fetch("/api/airtime/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: user.wallet.address,
            privyUserId: user.id,
            token: data.token,
            tokenAmount: data.amount,
            phoneNumber: data.phoneNumber,
            service: data.service,
            paymentTxHash: receipt.hash,
          }),
        });

        const purchaseResult = await purchaseResponse.json();

        if (purchaseResponse.ok && purchaseResult.success) {
          toast({
            title: "Success!",
            description: `Airtime sent to ${data.phoneNumber}. Transaction ID: ${purchaseResult.transaction.paybetaReference}`,
          });
        } else {
          throw new Error(purchaseResult.error || "Failed to purchase airtime");
        }
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error: any) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to process transaction",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Buy Airtime with Crypto</CardTitle>
          <CardDescription>
            Send airtime to any Nigerian phone number using USDC or USDT
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Token Selection */}
            <div className="space-y-2">
              <Label htmlFor="token">Select Token</Label>
              <Select
                value={selectedToken}
                onValueChange={(value) => setValue("token", value as SupportedToken)}
              >
                <SelectTrigger id="token">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USDC">USDC (USD Coin)</SelectItem>
                  <SelectItem value="USDT">USDT (Tether USD)</SelectItem>
                </SelectContent>
              </Select>
              {errors.token && (
                <p className="text-sm text-destructive">{errors.token.message}</p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
              {ngnAmount && (
                <p className="text-sm text-muted-foreground">
                  ≈ ₦{ngnAmount.toLocaleString()} NGN
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="08123456789"
                {...register("phoneNumber")}
              />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
              )}
            </div>

            {/* Network Selection */}
            <div className="space-y-2">
              <Label htmlFor="service">Network</Label>
              <Select
                value={watch("service")}
                onValueChange={(value) => setValue("service", value as AirtimeService)}
              >
                <SelectTrigger id="service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtn_vtu">MTN</SelectItem>
                  <SelectItem value="glo_vtu">GLO</SelectItem>
                  <SelectItem value="airtel_vtu">Airtel</SelectItem>
                  <SelectItem value="9mobile_vtu">9mobile</SelectItem>
                </SelectContent>
              </Select>
              {errors.service && (
                <p className="text-sm text-destructive">{errors.service.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Airtime
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
