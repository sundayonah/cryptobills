"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ethers } from "ethers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import config from "@/lib/config";
import { getTokenConfigFromProvider } from "@/lib/token-utils";
import { processProviders } from "@/lib/providers";
import { UTILITY_CATEGORIES } from "@/lib/categories";
import { getWalletAddressFromPrivyUser } from "@/lib/privy-utils";
import { useBalance } from "@/contexts/balance-context";
import { SUPPORTED_NETWORKS } from "@/lib/networks";
import { useWallets } from "@privy-io/react-auth";
import { processWalletPayment, getWalletChainId, waitForTransactionConfirmation } from "@/lib/wallet-payment";
import { convertToNGN } from "@/lib/exchange";
import type { SupportedToken, AirtimeService, AirtimeProvider, UtilityBillCategory } from "@/types";
import { motion } from "framer-motion";
import { Loader2, ArrowDown, Wallet } from "lucide-react";
import { Loading, LoadingSpinner, AirtimeFormSkeleton } from "@/components/ui/loading";
import Image from "next/image";

const airtimeSchema = z.object({
  token: z.enum(["USDC", "USDT"]),
  amount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= config.min_amount && num <= config.max_amount;
    },
    { message: `Amount must be between $${config.min_amount} and $${config.max_amount}` }
  ),
  phoneNumber: z.string().min(1, "Account/Phone number is required"),
  service: z.enum(["mtn_vtu", "glo_vtu", "airtel_vtu", "9mobile_vtu"]),
});

type AirtimeFormData = z.infer<typeof airtimeSchema>;

interface ExchangeRate {
  usdcToNgn: number;
  usdtToNgn: number;
  timestamp: number;
}

export function AirtimeSwapCard() {
  const { ready, authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const { toast } = useToast();
  const { getBalance, isLoading: isLoadingBalance, refreshBalances } = useBalance();
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ngnAmount, setNgnAmount] = useState<number | null>(null);
  const [providers, setProviders] = useState<Array<AirtimeProvider & { service: AirtimeService }>>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<UtilityBillCategory>("airtime");

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
      amount: "",
      service: "mtn_vtu",
    },
  });

  const selectedToken = watch("token");
  const selectedAmount = watch("amount");
  const selectedService = watch("service");
  const phoneNumber = watch("phoneNumber");

  // Get current balance for selected token
  const currentBalance = getBalance(selectedToken);
  const balanceAmount = currentBalance ? parseFloat(currentBalance.formatted) : 0;

  // Fetch providers based on selected category
  useEffect(() => {
    const fetchProviders = async () => {
      // Only fetch providers for enabled categories
      const category = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory);
      if (!category || !category.enabled) {
        setProviders([]);
        setLoadingProviders(false);
        return;
      }

      setLoadingProviders(true);
      try {
        const response = await fetch(`/api/providers?category=${selectedCategory}`);
        const data = await response.json();

        if (response.ok && data.status === "successful" && data.data && Array.isArray(data.data)) {
          // Process providers based on category
          if (selectedCategory === "airtime") {
            const processed = processProviders(data.data);
            setProviders(processed);
            // Set default service if available
            if (processed.length > 0) {
              setValue("service", processed[0].service);
            } else {
              setProviders([]);
            }
          } else {
            // For other categories, process providers that have a slug field
            const processed = data.data
              .filter((provider: any) => provider.status !== false && provider.slug)
              .map((provider: any) => ({
                ...provider,
                service: provider.slug as AirtimeService,
              }));
            setProviders(processed as Array<AirtimeProvider & { service: AirtimeService }>);
            // Set default service if available
            if (processed.length > 0) {
              setValue("service", processed[0].service);
            } else {
              setProviders([]);
            }
          }
        } else {
          // API returned an error or invalid response
          console.error("Failed to fetch providers:", {
            status: response.status,
            message: data.message || "Unknown error",
            data,
          });

          // Show error toast to user
          toast({
            title: "Failed to load providers",
            description: data.message || "Unable to fetch airtime providers. Please try again later.",
            variant: "destructive",
          });

          setProviders([]);
        }
      } catch (error) {
        console.error("Error fetching providers:", error);

        toast({
          title: "Error",
          description: "Failed to load providers. Please check your connection and try again.",
          variant: "destructive",
        });

        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    };
    fetchProviders();
  }, [selectedCategory, setValue, toast]);

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
    const interval = setInterval(fetchRate, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate NGN amount
  useEffect(() => {
    if (exchangeRate && selectedAmount) {
      const amount = parseFloat(selectedAmount);
      if (!isNaN(amount) && amount > 0) {
        const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
        setNgnAmount(Math.round(amount * rate));
      } else {
        setNgnAmount(null);
      }
    } else {
      setNgnAmount(null);
    }
  }, [selectedToken, selectedAmount, exchangeRate]);

  const onSubmit = async (data: AirtimeFormData) => {
    // Check if selected category is enabled
    const category = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory);
    if (!category || !category.enabled) {
      toast({
        title: "Service Not Available",
        description: `${category?.name || "This service"} is not yet available. Please select Airtime.`,
        variant: "destructive",
      });
      return;
    }

    // Validate phone number for airtime
    if (selectedCategory === "airtime" && !/^0\d{10}$/.test(data.phoneNumber)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid Nigerian phone number (e.g., 08123456789)",
        variant: "destructive",
      });
      return;
    }

    // Validate balance
    const balance = getBalance(data.token);
    const balanceAmount = balance ? parseFloat(balance.formatted) : 0;
    const inputAmount = parseFloat(data.amount);

    if (isNaN(inputAmount) || inputAmount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (inputAmount > balanceAmount) {
      toast({
        title: "Insufficient Balance",
        description: `You have ${balanceAmount.toFixed(6)} ${data.token}. Please enter an amount within your balance.`,
        variant: "destructive",
      });
      return;
    }

    if (!authenticated) {
      login();
      return;
    }

    // Get wallet address from user (checks both user.wallet and linkedAccounts)
    const walletAddress = user ? getWalletAddressFromPrivyUser(user) : null;

    if (!walletAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect a wallet to make payments. You can connect MetaMask, Trust Wallet, or create an embedded wallet.",
        variant: "destructive",
      });
      // Open Privy modal to connect wallet
      login();
      return;
    }

    if (!config.payment_recipient_address) {
      toast({
        title: "Configuration Error",
        description: "Payment recipient address is not configured",
        variant: "destructive",
      });
      return;
    }

    // Only process airtime for now
    if (selectedCategory !== "airtime") {
      toast({
        title: "Service Not Available",
        description: "Only Airtime is currently available. Other services coming soon.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // ============================================
      // STEP 1: VALIDATE CONFIGURATION FIRST (BEFORE ANY TRANSFERS)
      // ============================================

      // Validate PayCrest API is configured
      if (!config.paycrest_rate_api) {
        throw new Error('Exchange rate API is not configured. Please check PAYCREST_RATE_API environment variable.');
      }

      // Validate payment recipient address
      if (!config.payment_recipient_address) {
        throw new Error('Payment recipient address is not configured. Please check NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS environment variable.');
      }

      // ============================================
      // STEP 2: VALIDATE WALLET AND NETWORK
      // ============================================

      // Get Privy wallet (already available from useWallets hook at component level)
      if (!wallets || wallets.length === 0) {
        throw new Error("No wallet connected. Please connect a wallet first.");
      }

      const wallet = wallets[0];

      // Get current network chain ID from wallet
      const chainId = getWalletChainId(wallet);
      const networkInfo = SUPPORTED_NETWORKS.find(n => n.id === chainId);

      if (!networkInfo) {
        throw new Error(`Unsupported network. Please switch to a supported network.`);
      }

      // ============================================
      // STEP 3: VALIDATE EXCHANGE RATE API (BEFORE TRANSFER)
      // ============================================

      toast({
        title: "Validating",
        description: "Checking exchange rate...",
      });

      let ngnAmount: number;
      try {
        ngnAmount = await convertToNGN(data.amount, data.token);
      } catch (error: any) {
        throw new Error(`Failed to get exchange rate: ${error.message}. Please try again later.`);
      }

      // ============================================
      // STEP 4: VALIDATE PAYBETA BALANCE (BEFORE TRANSFER)
      // ============================================

      toast({
        title: "Checking Balance",
        description: "Verifying PayBeta has sufficient funds...",
      });

      // Check PayBeta balance via API route (server-side)
      let balanceResponse;
      try {
        const balanceApiResponse = await fetch('/api/paybeta/balance');
        const balanceData = await balanceApiResponse.json();

        if (!balanceApiResponse.ok || !balanceData.success) {
          throw new Error(balanceData.error || 'Failed to check PayBeta balance');
        }

        balanceResponse = balanceData;
      } catch (error: any) {
        throw new Error(`Failed to check PayBeta balance: ${error.message}. Please try again later.`);
      }

      const availableBalance = balanceResponse.data.availableBalance;

      if (availableBalance < ngnAmount) {
        throw new Error(
          `PayBeta has insufficient balance. ` +
          `Available: ₦${availableBalance.toLocaleString()}, ` +
          `Required: ₦${ngnAmount.toLocaleString()}. ` +
          `Please try again later or contact support.`
        );
      }

      toast({
        title: "Balance Verified",
        description: `PayBeta balance: ₦${availableBalance.toLocaleString()}`,
      });

      // ============================================
      // STEP 5: ALL VALIDATIONS PASSED - NOW TRANSFER TOKENS
      // ============================================

      // Transfer tokens using Viem + Privy pattern
      toast({
        title: "Processing Transfer",
        description: `Initiating ${data.token} transfer...`,
      });

      const transferResult = await processWalletPayment(wallet, {
        token: data.token,
        tokenAmount: data.amount,
        recipientAddress: config.payment_recipient_address,
        chainId: chainId,
      });

      const txHash = transferResult.transactionHash;
      const chainIdNum = transferResult.networkChainId;

      // Wait for transaction confirmation before proceeding
      toast({
        title: "Transaction Sent",
        description: `Waiting for blockchain confirmation... ${txHash.slice(0, 10)}...`,
      });

      const confirmation = await waitForTransactionConfirmation(
        txHash as `0x${string}`,
        chainIdNum
      );

      if (confirmation.status !== 'success') {
        throw new Error('Transaction failed on blockchain. Please try again.');
      }

      toast({
        title: "Transaction Confirmed",
        description: `Payment confirmed at block ${confirmation.blockNumber.toString()}`,
      });

      // ============================================
      // STEP 6: PROCESS AIRTIME PURCHASE
      // ============================================

      // Get service name from selected provider
      const selectedProvider = providers.find(p => p.service === data.service);
      const serviceName = selectedProvider?.name || data.service;

      // Use category-specific purchase endpoint (currently only airtime is implemented)
      const category = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory);
      const purchaseEndpoint = category?.id === 'airtime'
        ? "/api/airtime/purchase"  // Next.js API route (not PayBeta)
        : `/api/${selectedCategory}/purchase`;

      const purchaseResponse = await fetch(purchaseEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddress,
          privyUserId: user?.id,
          token: data.token,
          tokenAmount: data.amount,
          phoneNumber: data.phoneNumber,
          service: data.service,
          serviceName: serviceName,
          paymentTxHash: txHash,
          category: selectedCategory,
          networkChainId: chainIdNum,
        }),
      });

      const purchaseResult = await purchaseResponse.json();

      if (purchaseResponse.ok && purchaseResult.success) {
        const categoryName = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.name || 'Service';
        toast({
          title: "Success!",
          description: `${categoryName} sent to ${data.phoneNumber}. Transaction ID: ${purchaseResult.transaction.paybetaReference}`,
        });
        // Reset form
        setValue("amount", "");
        setValue("phoneNumber", "");
      } else {
        const categoryName = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.name || 'Service';
        throw new Error(purchaseResult.error || `Failed to purchase ${categoryName.toLowerCase()}`);
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

  const currentRate = exchangeRate
    ? selectedToken === "USDC"
      ? exchangeRate.usdcToNgn
      : exchangeRate.usdtToNgn
    : null;

  if (!ready) {
    return <AirtimeFormSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl p-6 border border-gray-200 shadow-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Category Selector */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Service Type</label>
          <Select
            value={selectedCategory}
            onValueChange={(value) => {
              setSelectedCategory(value as UtilityBillCategory);
              // Reset form when category changes
              setValue("amount", "");
              setValue("phoneNumber", "");
              setValue("service", "mtn_vtu");
            }}
          >
            <SelectTrigger className="w-full h-12 bg-gray-50 border-gray-300 text-gray-900 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              {UTILITY_CATEGORIES.map((category) => (
                <SelectItem
                  key={category.id}
                  value={category.id}
                  className="text-gray-900"
                  disabled={!category.enabled}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{category.name}</span>
                    {!category.enabled && (
                      <span className="text-xs text-gray-400 ml-2">(Coming soon)</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ProviderSelector - Only show for airtime, right after service type */}
        {selectedCategory === "airtime" && (
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Provider</label>
            {loadingProviders ? (
              <div className="w-full h-14 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-center">
                <LoadingSpinner size="sm" className="text-purple-600" />
                <span className="ml-2 text-sm text-purple-600">Loading providers...</span>
              </div>
            ) : (
              <Select
                value={selectedService}
                onValueChange={(value) => setValue("service", value as AirtimeService)}
                disabled={providers.length === 0 || !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled}
              >
                <SelectTrigger className="w-full h-14 bg-purple-600 border-purple-500 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <SelectValue placeholder={
                    !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled
                      ? "Service not available"
                      : "Select provider"
                  }>
                    {(() => {
                      if (selectedService && providers.length > 0 && selectedCategory === "airtime") {
                        const provider = providers.find(p => p.service === selectedService);
                        if (provider) {
                          return (
                            <div className="flex items-center gap-2">
                              <Image
                                src={provider.logo}
                                alt={provider.name}
                                width={24}
                                height={24}
                                className="w-6 h-6 rounded object-contain"
                                unoptimized
                                onError={(e: any) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <span>{provider.name.replace(' VTU', '')}</span>
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {providers.map((provider) => (
                    <SelectItem
                      key={provider.service}
                      value={provider.service}
                      className="text-gray-900"
                    >
                      <div className="flex items-center gap-2">
                        <Image
                          src={provider.logo}
                          alt={provider.name}
                          width={24}
                          height={24}
                          className="w-6 h-6 rounded object-contain"
                          unoptimized
                          onError={(e: any) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{provider.name.replace(' VTU', '')}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.service && (
              <p className="text-sm text-red-600">{errors.service.message}</p>
            )}
          </div>
        )}

        {/* Send Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600">Send</label>
            <button
              type="button"
              onClick={() => {
                if (balanceAmount > 0) {
                  // Format number without trailing zeros
                  // Convert to string and remove trailing zeros and decimal point if not needed
                  const formatted = parseFloat(balanceAmount.toFixed(6)).toString();
                  setValue("amount", formatted);
                }
              }}
              disabled={balanceAmount === 0 || isLoadingBalance}
              className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
              title="Set maximum balance"
            >
              Max
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.01"
              min={config.min_amount}
              max={config.max_amount}
              placeholder="0"
              className="flex-1 bg-gray-50 border-gray-300 text-gray-900 text-2xl h-16 rounded-xl"
              {...register("amount")}
            />
            <Select
              value={selectedToken}
              onValueChange={(value) => setValue("token", value as SupportedToken)}
            >
              <SelectTrigger className="w-[180px] h-16 bg-gray-50 border-gray-300 text-gray-900 rounded-xl">
                <SelectValue>
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{selectedToken}</span>
                      {isLoadingBalance ? (
                        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                      ) : (
                        (() => {
                          const balance = getBalance(selectedToken);
                          // Always show balance, default to 0.00 if not loaded yet
                          if (balance) {
                            const balanceValue = parseFloat(balance.formatted);
                            return (
                              <span className="text-xs text-gray-500 font-normal">
                                {balanceValue === 0
                                  ? "0.00"
                                  : balanceValue < 0.01
                                    ? "<0.01"
                                    : balanceValue.toFixed(2)}
                              </span>
                            );
                          }
                          // Show 0.00 if balance is not loaded (null)
                          return (
                            <span className="text-xs text-gray-500 font-normal">0.00</span>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="USDC" className="text-gray-900">
                  <div className="flex items-center justify-between w-full">
                    <span>USDC</span>
                    {isLoadingBalance ? (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-4" />
                    ) : (
                      (() => {
                        const balance = getBalance("USDC");
                        // Always show balance, default to 0.00 if not loaded yet
                        if (balance) {
                          const balanceValue = parseFloat(balance.formatted);
                          return (
                            <span className="text-xs text-gray-500 ml-4">
                              {balanceValue === 0
                                ? "0.00"
                                : balanceValue < 0.01
                                  ? "<0.01"
                                  : balanceValue.toFixed(2)}
                            </span>
                          );
                        }
                        // Show 0.00 if balance is not loaded (null)
                        return (
                          <span className="text-xs text-gray-500 ml-4">0.00</span>
                        );
                      })()
                    )}
                  </div>
                </SelectItem>
                <SelectItem value="USDT" className="text-gray-900">
                  <div className="flex items-center justify-between w-full">
                    <span>USDT</span>
                    {isLoadingBalance ? (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-400 ml-4" />
                    ) : (
                      (() => {
                        const balance = getBalance("USDT");
                        // Always show balance, default to 0.00 if not loaded yet
                        if (balance) {
                          const balanceValue = parseFloat(balance.formatted);
                          return (
                            <span className="text-xs text-gray-500 ml-4">
                              {balanceValue === 0
                                ? "0.00"
                                : balanceValue < 0.01
                                  ? "<0.01"
                                  : balanceValue.toFixed(2)}
                            </span>
                          );
                        }
                        // Show 0.00 if balance is not loaded (null)
                        return (
                          <span className="text-xs text-gray-500 ml-4">0.00</span>
                        );
                      })()
                    )}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {errors.amount && (
            <p className="text-sm text-red-600">{errors.amount.message}</p>
          )}
          {selectedAmount && !errors.amount && (() => {
            const inputAmount = parseFloat(selectedAmount);
            if (!isNaN(inputAmount) && inputAmount > balanceAmount) {
              return (
                <p className="text-sm text-red-600">
                  Insufficient balance. You have {balanceAmount.toFixed(6)} {selectedToken}
                </p>
              );
            }
            return null;
          })()}
        </div>

        {/* Receive Section */}
        <div className="space-y-2">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {selectedCategory === "airtime"
                  ? "Phone Number"
                  : selectedCategory === "electricity"
                    ? "Meter Number"
                    : selectedCategory === "cable_tv"
                      ? "Smart Card Number"
                      : "Account Number"}
              </label>
              <Input
                type="tel"
                placeholder={
                  selectedCategory === "airtime"
                    ? "08123456789"
                    : selectedCategory === "electricity"
                      ? "Enter meter number"
                      : selectedCategory === "cable_tv"
                        ? "Enter smart card number"
                        : "Enter account number"
                }
                className="w-full bg-gray-50 border-gray-300 text-gray-900 h-14 rounded-xl disabled:opacity-50"
                disabled={!UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled}
                {...register("phoneNumber")}
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-sm text-red-600">{errors.phoneNumber.message}</p>
            )}
            {ngnAmount && (
              <div className="text-center py-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">You will receive</p>
                <p className="text-xl font-semibold text-gray-900">
                  ₦{ngnAmount.toLocaleString()} NGN {selectedCategory === "airtime" ? "airtime" : selectedCategory === "data_bundle" ? "data" : selectedCategory === "electricity" ? "electricity" : selectedCategory === "cable_tv" ? "cable subscription" : "credit"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Purchase Button */}
        <Button
          type="submit"
          disabled={
            isProcessing ||
            !authenticated ||
            !getWalletAddressFromPrivyUser(user || {}) ||
            !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled ||
            !selectedAmount ||
            !phoneNumber ||
            !selectedService ||
            (() => {
              const inputAmount = parseFloat(selectedAmount || "0");
              return isNaN(inputAmount) || inputAmount <= 0 || inputAmount > balanceAmount;
            })() ||
            // Validate Nigerian phone number format for airtime
            (selectedCategory === "airtime" && !/^0\d{10}$/.test(phoneNumber || ""))
          }
          className="w-full h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-lg font-semibold border border-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!authenticated ? (
            <>
              <Wallet className="mr-2 h-5 w-5" />
              Sign in to Purchase
            </>
          ) : !getWalletAddressFromPrivyUser(user || {}) ? (
            <>
              <Wallet className="mr-2 h-5 w-5" />
              Connect Wallet to Purchase
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled ? (
            "Service Coming Soon"
          ) : (
            "Purchase"
          )}
        </Button>
      </form>
    </motion.div>
  );
}