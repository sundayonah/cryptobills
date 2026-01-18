"use client";

import { useState, useEffect, useCallback } from "react";
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
import { copyToClipboard } from "@/lib/utils";
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
import type { SupportedToken, AirtimeService, AirtimeProvider, UtilityBillCategory, DataBundleService, DataBundlePackage } from "@/types";
import { motion } from "framer-motion";
import { Loader2, ArrowDown, Wallet, X, Copy, Share2, Check } from "lucide-react";
import { getTokenLogoPath } from "@/lib/network-utils";
import { Loading, LoadingSpinner, AirtimeFormSkeleton } from "@/components/ui/loading";
import Image from "next/image";

const airtimeSchema = z.object({
  token: z.enum(["USDC", "USDT"]),
  amount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      // Basic validation: must be a valid positive number
      // Specific min/max validation is handled in the form's register validation function
      return !isNaN(num) && num > 0;
    },
    { message: "Please enter a valid amount" }
  ),
  phoneNumber: z.string().min(1, "Account/Phone number is required"),
  service: z.string().min(1, "Service is required"), // Allow any string for flexibility (airtime, data, electricity, etc.)
  bundleCode: z.string().optional(), // Required for data bundle
  meterType: z.enum(["prepaid", "postpaid"]).optional(), // Required for electricity
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
  const [calculatedTokenAmount, setCalculatedTokenAmount] = useState<number | null>(null); // Token amount calculated from NGN for airtime
  const [providers, setProviders] = useState<Array<AirtimeProvider & { service: AirtimeService | DataBundleService | string }>>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<UtilityBillCategory>("airtime");
  const [bundles, setBundles] = useState<DataBundlePackage[]>([]);
  const [loadingBundles, setLoadingBundles] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<string>("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [meterValidation, setMeterValidation] = useState<{
    customerName: string;
    customerAddress: string;
    meterNumber: string;
    meterType: string;
  } | null>(null);
  const [validatingMeter, setValidatingMeter] = useState(false);
  // Cable TV state
  const [cablePackages, setCablePackages] = useState<DataBundlePackage[]>([]); // Reuse DataBundlePackage type
  const [loadingCablePackages, setLoadingCablePackages] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [smartCardValidation, setSmartCardValidation] = useState<{
    customerName: string;
    smartCardNumber: string;
    service: string;
  } | null>(null);
  const [validatingSmartCard, setValidatingSmartCard] = useState(false);
  const [receipt, setReceipt] = useState<{
    reference: string;
    amount: number;
    biller: string;
    customerId: string;
    token?: string;
    unit?: string;
    bonusToken?: string;
    transactionDate: string;
    transactionId: string;
    category: string;
    recipient: string;
    customerName?: string;
    customerAddress?: string;
    meterType?: string;
    meterNumber?: string;
  } | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

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
      bundleCode: "",
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
          } else if (selectedCategory === "data_bundle") {
            // For data bundle, process providers that have a slug field
            const processed = data.data
              .filter((provider: any) => provider.status !== false && provider.slug)
              .map((provider: any) => ({
                ...provider,
                service: provider.slug as DataBundleService,
              }));
            setProviders(processed as Array<AirtimeProvider & { service: DataBundleService }>);
            // Set default service if available
            if (processed.length > 0) {
              setValue("service", processed[0].service);
              // Fetch bundles for the first provider
              fetchBundles(processed[0].service as DataBundleService);
            } else {
              setProviders([]);
            }
          } else if (selectedCategory === "electricity") {
            // For electricity, process providers that have a slug field (or derive from name)
            const processed = data.data
              .filter((provider: any) => provider.status !== false)
              .map((provider: any) => ({
                ...provider,
                service: provider.slug || provider.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
              }));
            setProviders(processed as Array<AirtimeProvider & { service: AirtimeService | DataBundleService | string }>);
            // Set default service if available
            if (processed.length > 0) {
              setValue("service", processed[0].service);
              // Reset meter validation when provider changes
              setMeterValidation(null);
            } else {
              setProviders([]);
            }
          } else if (selectedCategory === "cable_tv") {
            // For cable TV, process providers that have a slug field
            const processed = data.data
              .filter((provider: any) => provider.status !== false && provider.slug)
              .map((provider: any) => ({
                ...provider,
                service: provider.slug as string, // Cable TV uses string service names (dstv, gotv, startimes)
              }));
            setProviders(processed as Array<AirtimeProvider & { service: AirtimeService | DataBundleService | string }>);
            // Set default service if available
            if (processed.length > 0) {
              setValue("service", processed[0].service);
              // Fetch packages for the first provider
              fetchPackages(processed[0].service);
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

  // Fetch bundles when data bundle provider changes
  const fetchBundles = async (service: DataBundleService) => {
    if (selectedCategory !== "data_bundle") {
      setBundles([]);
      setSelectedBundle("");
      setValue("bundleCode", "");
      return;
    }

    setLoadingBundles(true);
    try {
      const response = await fetch(`/api/data-bundle/list?service=${service}`);
      const data = await response.json();

      if (response.ok && data.status === "successful" && data.data?.packages) {
        setBundles(data.data.packages);
        // Auto-select first bundle if available
        if (data.data.packages.length > 0) {
          setSelectedBundle(data.data.packages[0].code);
          setValue("bundleCode", data.data.packages[0].code);
          // Set amount to bundle price in NGN (convert from string to number)
          const bundlePrice = parseFloat(data.data.packages[0].price);
          if (!isNaN(bundlePrice) && bundlePrice > 0 && exchangeRate) {
            // Calculate exact token amount needed for exact NGN price
            const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
            const exactTokenAmount = (bundlePrice / rate).toFixed(8); // Use 8 decimals for precision
            setValue("amount", exactTokenAmount);
          }
        }
      } else {
        setBundles([]);
        setSelectedBundle("");
        setValue("bundleCode", "");
        toast({
          title: "Failed to load bundles",
          description: data.message || "Unable to fetch data bundle packages.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching bundles:", error);
      setBundles([]);
      setSelectedBundle("");
      setValue("bundleCode", "");
      toast({
        title: "Error",
        description: "Failed to load data bundle packages. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingBundles(false);
    }
  };

  // Fetch cable TV packages
  const fetchPackages = async (service: string) => {
    if (selectedCategory !== "cable_tv") {
      setCablePackages([]);
      setSelectedPackage("");
      return;
    }

    setLoadingCablePackages(true);
    try {
      const response = await fetch("/api/cable/bouquet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const data = await response.json();

      if (response.ok && data.status === "successful" && data.data?.packages) {
        setCablePackages(data.data.packages);
        // Auto-select first package if available
        if (data.data.packages.length > 0) {
          setSelectedPackage(data.data.packages[0].code);
          // Set amount to package price in NGN (convert from string to number)
          const packagePrice = parseFloat(data.data.packages[0].price);
          if (!isNaN(packagePrice) && packagePrice > 0 && exchangeRate) {
            // Calculate exact token amount needed for exact NGN price
            const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
            const exactTokenAmount = (packagePrice / rate).toFixed(8); // Use 8 decimals for precision
            setValue("amount", exactTokenAmount);
          }
        }
      } else {
        setCablePackages([]);
        setSelectedPackage("");
        toast({
          title: "Failed to load packages",
          description: data.message || "Unable to fetch cable TV packages.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching cable packages:", error);
      setCablePackages([]);
      setSelectedPackage("");
      toast({
        title: "Error",
        description: "Failed to load cable TV packages. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingCablePackages(false);
    }
  };

  // Validate smart card for cable TV
  const validateSmartCard = useCallback(async (service: string, smartCardNumber: string) => {
    if (!smartCardNumber) {
      return null;
    }

    setValidatingSmartCard(true);
    try {
      const response = await fetch("/api/cable/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          smartCardNumber,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === "successful" && data.data) {
        setSmartCardValidation({
          customerName: data.data.customerName,
          smartCardNumber: data.data.smartCardNumber,
          service: data.data.service,
        });
        return data.data;
      } else {
        toast({
          title: "Validation Failed",
          description: data.message || "Failed to validate smart card number",
          variant: "destructive",
        });
        setSmartCardValidation(null);
        return null;
      }
    } catch (error) {
      console.error("Error validating smart card:", error);
      toast({
        title: "Error",
        description: "Failed to validate smart card number. Please try again.",
        variant: "destructive",
      });
      setSmartCardValidation(null);
      return null;
    } finally {
      setValidatingSmartCard(false);
    }
  }, [toast]);

  // Validate meter for electricity
  const validateMeter = useCallback(async (service: string, meterNumber: string, meterType: "prepaid" | "postpaid") => {
    if (!meterNumber || !meterType) {
      return null;
    }

    setValidatingMeter(true);
    try {
      const response = await fetch("/api/electricity/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          meterNumber,
          meterType,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === "successful" && data.data) {
        setMeterValidation({
          customerName: data.data.customerName,
          customerAddress: data.data.customerAddress,
          meterNumber: data.data.meterNumber,
          meterType: data.data.meterType,
        });
        return data.data;
      } else {
        toast({
          title: "Validation Failed",
          description: data.message || "Failed to validate meter number",
          variant: "destructive",
        });
        setMeterValidation(null);
        return null;
      }
    } catch (error) {
      console.error("Error validating meter:", error);
      toast({
        title: "Error",
        description: "Failed to validate meter number. Please try again.",
        variant: "destructive",
      });
      setMeterValidation(null);
      return null;
    } finally {
      setValidatingMeter(false);
    }
  }, [toast]);

  // Auto-validate meter number for electricity when meter number, service, and meter type are filled
  useEffect(() => {
    if (
      selectedCategory === "electricity" &&
      phoneNumber &&
      phoneNumber.trim().length >= 10 && // Minimum meter number length
      selectedService &&
      meterType &&
      !meterValidation &&
      !validatingMeter
    ) {
      // Debounce validation - wait 1 second after user stops typing
      const timer = setTimeout(() => {
        validateMeter(selectedService, phoneNumber.trim(), meterType);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [phoneNumber, selectedService, meterType, selectedCategory, meterValidation, validatingMeter, validateMeter]);

  // Watch for service changes in data bundle category
  useEffect(() => {
    if (selectedCategory === "data_bundle" && selectedService) {
      fetchBundles(selectedService as DataBundleService);
    } else {
      setBundles([]);
      setSelectedBundle("");
      setValue("bundleCode", "");
    }
    // Reset meter validation when category changes
    if (selectedCategory !== "electricity") {
      setMeterValidation(null);
    }
    // Reset smart card validation when category changes
    if (selectedCategory !== "cable_tv") {
      setSmartCardValidation(null);
    }
  }, [selectedService, selectedCategory, setValue]);

  // Watch for service changes in cable TV category
  useEffect(() => {
    if (selectedCategory === "cable_tv" && selectedService) {
      fetchPackages(selectedService);
    } else {
      setCablePackages([]);
      setSelectedPackage("");
    }
  }, [selectedService, selectedCategory]);

  // Auto-validate smart card number for cable TV when smart card number and service are filled
  useEffect(() => {
    if (
      selectedCategory === "cable_tv" &&
      phoneNumber &&
      phoneNumber.trim().length >= 10 && // Smart card numbers are typically 10 digits
      selectedService &&
      !smartCardValidation &&
      !validatingSmartCard
    ) {
      // Debounce validation - wait 1 second after user stops typing
      const timer = setTimeout(() => {
        validateSmartCard(selectedService, phoneNumber.trim());
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [phoneNumber, selectedService, selectedCategory, smartCardValidation, validatingSmartCard, validateSmartCard]);

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

  // Recalculate exact token amount when token changes (for bundles/packages with fixed NGN prices)
  useEffect(() => {
    if (exchangeRate && (selectedBundle || selectedPackage)) {
      if (selectedCategory === "data_bundle" && selectedBundle) {
        const bundle = bundles.find(b => b.code === selectedBundle);
        if (bundle) {
          const bundlePrice = parseFloat(bundle.price);
          if (!isNaN(bundlePrice) && bundlePrice > 0) {
            const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
            const exactTokenAmount = (bundlePrice / rate).toFixed(20);
            setValue("amount", exactTokenAmount);
          }
        }
      } else if (selectedCategory === "cable_tv" && selectedPackage) {
        const pkg = cablePackages.find(p => p.code === selectedPackage);
        if (pkg) {
          const packagePrice = parseFloat(pkg.price);
          if (!isNaN(packagePrice) && packagePrice > 0) {
            const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
            const exactTokenAmount = (packagePrice / rate).toFixed(20);
            setValue("amount", exactTokenAmount);
          }
        }
      }
    }
  }, [selectedToken, exchangeRate, selectedBundle, selectedPackage, selectedCategory, bundles, cablePackages, setValue]);

  // Calculate amounts based on category
  // For airtime: selectedAmount is NGN, calculate tokenAmount
  // For other categories: selectedAmount is tokenAmount, calculate NGN
  useEffect(() => {
    if (exchangeRate && selectedAmount) {
      const amount = parseFloat(selectedAmount);
      if (!isNaN(amount) && amount > 0) {
        const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;

        if (selectedCategory === "airtime" || selectedCategory === "electricity") {
          // For airtime and electricity: amount is NGN (already integer from input), calculate tokenAmount
          const ngnAmountInt = Math.round(amount); // Ensure integer (input should already be integer)
          const tokenAmt = ngnAmountInt / rate;
          setNgnAmount(ngnAmountInt); // Store NGN amount (integer)
          setCalculatedTokenAmount(tokenAmt); // Store calculated token amount
        } else {
          // For other categories: amount is tokenAmount, calculate NGN
          setNgnAmount(Math.round(amount * rate));
          setCalculatedTokenAmount(null);
        }
      } else {
        setNgnAmount(null);
        setCalculatedTokenAmount(null);
      }
    } else {
      setNgnAmount(null);
      setCalculatedTokenAmount(null);
    }
  }, [selectedToken, selectedAmount, exchangeRate, selectedCategory]);

  // Helper function to reset form based on category
  const resetForm = useCallback(() => {
    setValue("amount", "");
    setValue("phoneNumber", "");
    if (selectedCategory === "electricity") {
      setMeterValidation(null);
    }
    if (selectedCategory === "cable_tv") {
      setSmartCardValidation(null);
      setSelectedPackage("");
    }
  }, [selectedCategory, setValue]);

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

    // Validate phone number for airtime and data bundle
    if ((selectedCategory === "airtime" || selectedCategory === "data_bundle") && !/^0\d{10}$/.test(data.phoneNumber)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid Nigerian phone number (e.g., 08123456789)",
        variant: "destructive",
      });
      return;
    }

    // Validate meter for electricity
    if (selectedCategory === "electricity") {
      if (!meterType) {
        toast({
          title: "Meter Type Required",
          description: "Please select meter type (Prepaid or Postpaid)",
          variant: "destructive",
        });
        return;
      }
      if (!meterValidation) {
        toast({
          title: "Meter Not Validated",
          description: "Please validate your meter number first",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate minimum amount for airtime (100 NGN minimum)
    if (selectedCategory === "airtime") {
      const inputNgnAmount = parseFloat(data.amount);
      if (!isNaN(inputNgnAmount) && inputNgnAmount < 100) {
        toast({
          title: "Amount Too Low",
          description: "Airtime purchases require a minimum of ₦100. Please enter at least ₦100.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate minimum amount for electricity (1000 NGN minimum)
    if (selectedCategory === "electricity") {
      const inputNgnAmount = parseFloat(data.amount);
      if (!isNaN(inputNgnAmount) && inputNgnAmount < 1000) {
        toast({
          title: "Amount Too Low",
          description: "Electricity purchases require a minimum of ₦1,000. Please enter at least ₦1,000.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate bundle code for data bundle
    if (selectedCategory === "data_bundle" && !data.bundleCode) {
      toast({
        title: "Bundle Required",
        description: "Please select a data bundle",
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

    // For airtime and electricity, inputAmount is NGN, so compare calculatedTokenAmount with balance
    // For other categories, inputAmount is tokenAmount, so compare directly
    const tokenAmountToCheck = (selectedCategory === "airtime" || selectedCategory === "electricity") && calculatedTokenAmount !== null
      ? calculatedTokenAmount
      : inputAmount;

    if (tokenAmountToCheck > balanceAmount) {
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
      let tokenAmountForTransfer: string; // Token amount to transfer from wallet

      try {
        if (selectedCategory === "airtime" || selectedCategory === "electricity") {
          // For airtime and electricity: data.amount is NGN (should already be integer from input validation)
          const inputNgnAmount = parseFloat(data.amount);
          if (isNaN(inputNgnAmount) || inputNgnAmount <= 0) {
            throw new Error("Invalid NGN amount");
          }
          // Ensure integer (input validation should have caught decimals, but ensure it here)
          ngnAmount = Math.round(inputNgnAmount);

          // Use the already-calculated token amount from state (same as display)
          // This ensures EXACT match between UI display and wallet transfer amount
          if (calculatedTokenAmount !== null && calculatedTokenAmount > 0) {
            tokenAmountForTransfer = calculatedTokenAmount.toFixed(20);
          } else {
            // Fallback: calculate if state not available (shouldn't happen normally)
            let rate: number;
            if (exchangeRate) {
              rate = data.token === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
            } else {
              rate = await convertToNGN("1", data.token);
            }
            const calculatedToken = ngnAmount / rate;
            tokenAmountForTransfer = calculatedToken.toFixed(20);
          }
          setNgnAmount(ngnAmount); // Store NGN amount (integer)
        } else {
          // For other categories: data.amount is tokenAmount, convert to NGN
          tokenAmountForTransfer = data.amount;
          ngnAmount = await convertToNGN(data.amount, data.token);
          setNgnAmount(ngnAmount);
        }
      } catch (error: any) {
        throw new Error(`Failed to get exchange rate: ${error.message}. Please try again later.`);
      }

      // Validate minimum amount for electricity (PayBeta requires minimum 1000 NGN)
      if (selectedCategory === "electricity") {
        const ELECTRICITY_MIN_AMOUNT_NGN = 1000;
        const roundedNgnAmount = Math.round(ngnAmount);
        if (roundedNgnAmount < ELECTRICITY_MIN_AMOUNT_NGN) {
          toast({
            title: "Amount Too Low",
            description: `Electricity purchases require a minimum of ₦${ELECTRICITY_MIN_AMOUNT_NGN.toLocaleString()}. Your amount (₦${roundedNgnAmount.toLocaleString()}) is too low.`,
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }
      }

      // Show user the actual amount that will be charged (in case it differs from previously displayed amount)
      const previouslyDisplayedAmount = ngnAmount !== null ? ngnAmount : 0;
      // Note: We've already updated setNgnAmount above, so this comparison is for the old value
      // The display will update automatically via the useEffect that watches ngnAmount

      // ============================================
      // STEP 4: VALIDATE PAYBETA BALANCE (BEFORE TRANSFER)
      // ============================================

      toast({
        title: "Checking Balance",
        description: "Verifying Wallet has sufficient funds...",
      });

      // Check Wallet balance via API route (server-side)
      let balanceResponse;
      try {
        const balanceApiResponse = await fetch('/api/paybeta/balance');
        const balanceData = await balanceApiResponse.json();

        if (!balanceApiResponse.ok || !balanceData.success) {
          throw new Error(balanceData.error || 'Failed to check Wallet balance');
        }

        balanceResponse = balanceData;
      } catch (error: any) {
        throw new Error(`Failed to check Wallet balance: ${error.message}. Please try again later.`);
      }

      const availableBalance = balanceResponse.data.availableBalance;

      if (availableBalance < ngnAmount) {
        throw new Error(
          `Wallet has insufficient balance. ` +
          `Available: ₦${availableBalance.toLocaleString()}, ` +
          `Required: ₦${ngnAmount.toLocaleString()}. ` +
          `Please try again later or contact support.`
        );
      }

      toast({
        title: "Balance Verified",
        description: `Checking balance: ₦${availableBalance.toLocaleString()}`,
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
        tokenAmount: tokenAmountForTransfer, // Use calculated token amount for airtime
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

      // Use category-specific purchase endpoint
      const category = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory);
      const purchaseEndpoint = category?.id === 'airtime'
        ? "/api/airtime/purchase"
        : category?.id === 'data_bundle'
          ? "/api/data-bundle/purchase"
          : `/api/${selectedCategory}/purchase`;

      const purchaseBody: any = {
        walletAddress: walletAddress,
        privyUserId: user?.id,
        token: data.token,
        tokenAmount: tokenAmountForTransfer, // Use calculated token amount for airtime, original for others
        service: data.service,
        serviceName: serviceName,
        paymentTxHash: txHash,
        category: selectedCategory,
        networkChainId: chainIdNum,
      };

      // Add category-specific fields
      if (selectedCategory === "airtime" || selectedCategory === "data_bundle") {
        purchaseBody.phoneNumber = data.phoneNumber;
      }

      // For airtime and electricity, send serviceAmount (NGN integer) so API knows exact amount
      if (selectedCategory === "airtime" || selectedCategory === "electricity") {
        purchaseBody.serviceAmount = Math.round(ngnAmount); // NGN amount (integer)
      }

      if (selectedCategory === "data_bundle" && data.bundleCode) {
        purchaseBody.code = data.bundleCode;
        // Send exact bundle price in NGN
        const selectedBundleObj = bundles.find(b => b.code === data.bundleCode);
        if (selectedBundleObj) {
          purchaseBody.serviceAmount = parseFloat(selectedBundleObj.price); // Exact NGN price from bundle
        }
      }

      if (selectedCategory === "electricity") {
        purchaseBody.meterNumber = data.phoneNumber; // Reuse phoneNumber field for meter number
        purchaseBody.meterType = meterType;
        if (meterValidation) {
          purchaseBody.customerName = meterValidation.customerName;
          purchaseBody.customerAddress = meterValidation.customerAddress;
        }
      }

      if (selectedCategory === "cable_tv") {
        purchaseBody.smartCardNumber = data.phoneNumber; // Reuse phoneNumber field for smart card number
        purchaseBody.packageCode = selectedPackage;
        if (smartCardValidation) {
          purchaseBody.customerName = smartCardValidation.customerName;
        }
        // Send exact package price in NGN
        const selectedPackageObj = cablePackages.find(p => p.code === selectedPackage);
        if (selectedPackageObj) {
          purchaseBody.serviceAmount = parseFloat(selectedPackageObj.price); // Exact NGN price from package
        }
      }

      const purchaseResponse = await fetch(purchaseEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purchaseBody),
      });

      const purchaseResult = await purchaseResponse.json();

      if (purchaseResponse.ok && purchaseResult.success) {
        const categoryName = UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.name || 'Service';
        const recipient = selectedCategory === "electricity"
          ? data.phoneNumber // Meter number
          : data.phoneNumber; // Phone number

        // Check if transaction status is processing
        const transactionStatus = purchaseResult.transaction?.status || 'completed';

        if (transactionStatus === 'processing') {
          // Transaction is pending/processing
          toast({
            title: "Transaction Processing",
            description: purchaseResult.transaction?.message || `Your ${categoryName.toLowerCase()} purchase is being processed. Please check back later.`,
          });

          // Reset form but don't show receipt yet
          resetForm();
          return; // Exit early - don't show receipt for pending transactions
        }

        // Store receipt data for electricity (contains token and unit)
        if (selectedCategory === "electricity" && purchaseResult.transaction) {
          // Extract receipt data from API response (from PayBeta directly)
          const receiptData = {
            reference: purchaseResult.transaction.paybetaReference || "",
            amount: purchaseResult.transaction.amount || Math.round(ngnAmount),
            biller: purchaseResult.transaction.biller || serviceName,
            customerId: purchaseResult.transaction.customerId || recipient,
            token: purchaseResult.transaction.token,
            unit: purchaseResult.transaction.unit,
            bonusToken: purchaseResult.transaction.bonusToken || "",
            transactionDate: purchaseResult.transaction.transactionDate || new Date().toLocaleString(),
            transactionId: purchaseResult.transaction.paybetaTransactionId || "",
            category: categoryName,
            recipient: recipient,
            customerName: meterValidation?.customerName,
            customerAddress: meterValidation?.customerAddress,
            meterType: meterType === "prepaid" ? "Prepaid" : "Postpaid",
            meterNumber: data.phoneNumber, // Meter number
          };
          setReceipt(receiptData);
          setShowReceipt(true);
        } else {
          toast({
            title: "Success!",
            description: `${categoryName} purchased for ${recipient}. Transaction ID: ${purchaseResult.transaction.paybetaReference}`,
          });
        }

        // Reset form
        resetForm();
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              setValue("service", value === "data_bundle" ? "mtn_data" : "mtn_vtu");
              setValue("bundleCode", "");
              setBundles([]);
              setSelectedBundle("");
            }}
          >
            <SelectTrigger className="w-full h-10 bg-gray-50 border-gray-300 text-gray-900 rounded-xl">
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

        {/* ProviderSelector - Show for airtime, data bundle, and electricity */}
        {(selectedCategory === "airtime" || selectedCategory === "data_bundle" || selectedCategory === "electricity" || selectedCategory === "cable_tv") && (
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Provider</label>
            {loadingProviders ? (
              <div className="w-full h-12 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-center">
                <LoadingSpinner size="sm" className="text-purple-600" />
                <span className="ml-2 text-sm text-purple-600">Loading providers...</span>
              </div>
            ) : (
              <Select
                value={selectedService}
                onValueChange={(value) => {
                  setValue("service", value as AirtimeService | DataBundleService | string);
                  if (selectedCategory === "data_bundle") {
                    fetchBundles(value as DataBundleService);
                  }
                  if (selectedCategory === "electricity") {
                    // Reset meter validation when provider changes
                    setMeterValidation(null);
                  }
                }}
                disabled={providers.length === 0 || !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled}
              >
                <SelectTrigger className="w-full h-14 bg-purple-600 border-purple-500 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <SelectValue placeholder={
                    !UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled
                      ? "Service not available"
                      : "Select provider"
                  }>
                    {(() => {
                      if (selectedService && providers.length > 0 && (selectedCategory === "airtime" || selectedCategory === "data_bundle" || selectedCategory === "electricity" || selectedCategory === "cable_tv")) {
                        const provider = providers.find(p => p.service === selectedService);
                        if (provider) {
                          return (
                            <div className="flex items-center gap-2">
                              {provider.logo && (
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
                              )}
                              <span>{provider.name.replace(' VTU', '').replace(' Data', '').replace(' Electricity', '').replace(' Cable TV', '')}</span>
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
                        {provider.logo && (
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
                        )}
                        <span>{provider.name.replace(' VTU', '').replace(' Data', '').replace(' Electricity', '').replace(' Cable TV', '')}</span>
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

        {/* Bundle Selector - Only show for data bundle */}
        {selectedCategory === "data_bundle" && (
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Data Bundle</label>
            {loadingBundles ? (
              <div className="w-full h-14 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center">
                <LoadingSpinner size="sm" className="text-gray-600" />
                <span className="ml-2 text-sm text-gray-600">Loading bundles...</span>
              </div>
            ) : bundles.length > 0 ? (
              <Select
                value={selectedBundle}
                onValueChange={(value) => {
                  setSelectedBundle(value);
                  setValue("bundleCode", value);
                  const bundle = bundles.find(b => b.code === value);
                  if (bundle && exchangeRate) {
                    // Calculate exact token amount needed for exact NGN price
                    const bundlePrice = parseFloat(bundle.price);
                    if (!isNaN(bundlePrice) && bundlePrice > 0) {
                      const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
                      const exactTokenAmount = (bundlePrice / rate).toFixed(8); // Use 8 decimals for precision
                      setValue("amount", exactTokenAmount);
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full h-14 bg-gray-50 border-gray-300 text-gray-900 rounded-xl hover:bg-gray-100">
                  <SelectValue placeholder="Select data bundle">
                    {selectedBundle && bundles.find(b => b.code === selectedBundle) && (
                      <div className="flex items-center justify-between w-full pr-2 gap-2 min-w-0">
                        <span className="font-medium text-base truncate">
                          {bundles.find(b => b.code === selectedBundle)?.description}
                        </span>
                        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap flex-shrink-0">
                          ₦{parseFloat(bundles.find(b => b.code === selectedBundle)?.price || "0").toFixed(2)}
                        </span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="bg-white border-gray-200 max-h-[300px] w-[var(--radix-select-trigger-width)]"
                  position="popper"
                  sideOffset={4}
                >
                  {bundles.map((bundle) => (
                    <SelectItem
                      key={bundle.code}
                      value={bundle.code}
                      className="text-gray-900 cursor-pointer hover:bg-gray-50 py-3"
                    >
                      <div className="flex items-start justify-between w-full gap-2">
                        <span className="font-medium text-sm flex-1 break-words leading-tight">{bundle.description}</span>
                        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap flex-shrink-0 ml-2">
                          ₦{parseFloat(bundle.price).toFixed(2)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-14 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center">
                <span className="text-sm text-gray-500">No bundles available</span>
              </div>
            )}
            {!selectedBundle && selectedCategory === "data_bundle" && (
              <p className="text-sm text-red-600">Please select a data bundle</p>
            )}
          </div>
        )}

        {/* Package Selector - Only show for cable TV */}
        {selectedCategory === "cable_tv" && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 mb-1 block">Select Package</label>
            {loadingCablePackages ? (
              <div className="w-full h-14 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-gray-600 mr-2" />
                <span className="ml-2 text-sm text-gray-600">Loading packages...</span>
              </div>
            ) : cablePackages.length > 0 ? (
              <Select
                value={selectedPackage}
                onValueChange={(value) => {
                  setSelectedPackage(value);
                  const pkg = cablePackages.find(p => p.code === value);
                  if (pkg && exchangeRate) {
                    // Calculate exact token amount needed for exact NGN price
                    const packagePrice = parseFloat(pkg.price);
                    if (!isNaN(packagePrice) && packagePrice > 0) {
                      const rate = selectedToken === "USDC" ? exchangeRate.usdcToNgn : exchangeRate.usdtToNgn;
                      const exactTokenAmount = (packagePrice / rate).toFixed(8); // Use 8 decimals for precision
                      setValue("amount", exactTokenAmount);
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full h-14 bg-gray-50 border-gray-300 text-gray-900 rounded-xl hover:bg-gray-100">
                  <SelectValue placeholder="Select cable package">
                    {selectedPackage && cablePackages.find(p => p.code === selectedPackage) && (
                      <div className="flex items-center justify-between w-full pr-2 gap-2 min-w-0">
                        <span className="font-medium text-base truncate">
                          {cablePackages.find(p => p.code === selectedPackage)?.description}
                        </span>
                        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap flex-shrink-0">
                          ₦{parseFloat(cablePackages.find(p => p.code === selectedPackage)?.price || "0").toFixed(2)}
                        </span>
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="bg-white border-gray-200 max-h-[300px] w-[var(--radix-select-trigger-width)]"
                  position="popper"
                  sideOffset={4}
                >
                  {cablePackages.map((pkg) => (
                    <SelectItem
                      key={pkg.code}
                      value={pkg.code}
                      className="text-gray-900 cursor-pointer hover:bg-gray-50 py-3"
                    >
                      <div className="flex items-start justify-between w-full gap-2">
                        <span className="font-medium text-sm flex-1 break-words leading-tight">{pkg.description}</span>
                        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap flex-shrink-0 ml-2">
                          ₦{parseFloat(pkg.price).toFixed(2)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full h-14 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center">
                <span className="text-sm text-gray-500">No packages available</span>
              </div>
            )}
            {!selectedPackage && selectedCategory === "cable_tv" && (
              <p className="text-sm text-red-600">Please select a package</p>
            )}
          </div>
        )}

        {/* Send Section */}
        <div className="space-y-2">
          <div>
            <label className="text-sm text-gray-600">
              {(selectedCategory === "airtime" || selectedCategory === "electricity") ? "Amount (NGN)" : "Send"}
            </label>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              step={(selectedCategory === "airtime" || selectedCategory === "electricity") ? "1" : "0.01"}
              min={selectedCategory === "airtime" ? 100 : selectedCategory === "electricity" ? 1000 : config.min_amount}
              max={config.max_amount}
              placeholder="0"
              disabled={selectedCategory === "data_bundle" || selectedCategory === "cable_tv"}
              className="flex-1 bg-gray-50 border-gray-300 text-gray-900 text-2xl h-12 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100"
              onKeyDown={(e) => {
                // Block decimal point, comma, minus, and scientific notation for airtime and electricity
                if (selectedCategory === "airtime" || selectedCategory === "electricity") {
                  if (e.key === "." || e.key === "," || e.key === "-" || e.key === "e" || e.key === "E") {
                    e.preventDefault();
                  }
                }
              }}
              {...(() => {
                const { onChange: registerOnChange, ...registerProps } = register("amount", {
                  validate: (value) => {
                    if (selectedCategory === "airtime") {
                      const num = parseFloat(value);
                      // For airtime, must be an integer and minimum 100 NGN
                      if (isNaN(num) || !Number.isInteger(num)) {
                        return "Please enter a whole number (e.g., 200, 500)";
                      }
                      if (num < 100) {
                        return "Minimum amount is ₦100 for airtime";
                      }
                    }
                    if (selectedCategory === "electricity") {
                      const num = parseFloat(value);
                      // For electricity, must be an integer and minimum 1000 NGN
                      if (isNaN(num) || !Number.isInteger(num)) {
                        return "Please enter a whole number (e.g., 1000, 2000)";
                      }
                      if (num < 1000) {
                        return "Minimum amount is ₦1,000 for electricity";
                      }
                    }
                    return true;
                  }
                });
                return {
                  ...registerProps,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    // Remove any decimal values that get pasted for airtime and electricity
                    if (selectedCategory === "airtime" || selectedCategory === "electricity") {
                      const value = e.target.value;
                      // Remove decimal point and everything after it
                      if (value.includes(".")) {
                        const integerValue = value.split(".")[0];
                        e.target.value = integerValue;
                        setValue("amount", integerValue, { shouldValidate: true });
                      } else {
                        // Call register's onChange for non-airtime/electricity or when no decimal
                        registerOnChange(e);
                      }
                    } else {
                      // Call register's onChange for other categories
                      registerOnChange(e);
                    }
                  }
                };
              })()}
            />
            <Select
              value={selectedToken}
              onValueChange={(value) => {
                setValue("token", value as SupportedToken);
                // Token change will trigger useEffect to recalculate exact amount for bundles/packages
              }}
            >
              <SelectTrigger className="w-[180px] h-12 bg-gray-50 border-gray-300 text-gray-900 rounded-xl">
                <SelectValue>
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <Image
                        src={getTokenLogoPath(selectedToken)}
                        alt={selectedToken}
                        width={20}
                        height={20}
                        className="rounded-full flex-shrink-0"
                      />
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
                    <div className="flex items-center gap-2">
                      <Image
                        src={getTokenLogoPath("USDC")}
                        alt="USDC"
                        width={20}
                        height={20}
                        className="rounded-full flex-shrink-0"
                      />
                      <span>USDC</span>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <Image
                        src={getTokenLogoPath("USDT")}
                        alt="USDT"
                        width={20}
                        height={20}
                        className="rounded-full flex-shrink-0"
                      />
                      <span>USDT</span>
                    </div>
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
            if (isNaN(inputAmount) || inputAmount <= 0) return null;

            // For airtime and electricity, inputAmount is NGN, so compare calculatedTokenAmount with balance
            // For other categories, inputAmount is tokenAmount, so compare directly
            const tokenAmountToCheck = (selectedCategory === "airtime" || selectedCategory === "electricity") && calculatedTokenAmount !== null
              ? calculatedTokenAmount
              : inputAmount;

            if (tokenAmountToCheck > balanceAmount) {
              return (
                <p className="text-sm text-red-600">
                  Insufficient balance. You have {balanceAmount.toFixed(6)} {selectedToken}
                </p>
              );
            }
            return null;
          })()}
          {/* Airtime minimum amount validation */}
          {selectedCategory === "airtime" && selectedAmount && !errors.amount && (() => {
            const inputAmount = parseFloat(selectedAmount);
            if (!isNaN(inputAmount) && inputAmount < 100) {
              return (
                <p className="text-sm text-red-600">
                  Airtime purchases require a minimum of ₦100.
                </p>
              );
            }
            return null;
          })()}
          {/* Electricity minimum amount validation */}
          {selectedCategory === "electricity" && selectedAmount && !errors.amount && (() => {
            const inputAmount = parseFloat(selectedAmount);
            if (!isNaN(inputAmount) && inputAmount < 1000) {
              return (
                <p className="text-sm text-red-600">
                  Electricity purchases require a minimum of ₦1,000.
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
                {selectedCategory === "airtime" || selectedCategory === "data_bundle"
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
                  selectedCategory === "airtime" || selectedCategory === "data_bundle"
                    ? "08123456789"
                    : selectedCategory === "electricity"
                      ? "Enter meter number"
                      : selectedCategory === "cable_tv"
                        ? "Enter smart card number"
                        : "Enter account number"
                }
                className="w-full bg-gray-50 border-gray-300 text-gray-900 h-12 rounded-xl disabled:opacity-50"
                disabled={!UTILITY_CATEGORIES.find(cat => cat.id === selectedCategory)?.enabled}
                {...register("phoneNumber")}
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-sm text-red-600">{errors.phoneNumber.message}</p>
            )}

            {/* Meter Type Selector for Electricity */}
            {selectedCategory === "electricity" && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500 mb-1 block">Meter Type</label>
                <Select
                  value={meterType}
                  onValueChange={(value) => {
                    setMeterType(value as "prepaid" | "postpaid");
                    setMeterValidation(null); // Reset validation when meter type changes
                  }}
                >
                  <SelectTrigger className="w-full bg-gray-50 border-gray-300 text-gray-900 h-12 rounded-xl">
                    <SelectValue>
                      <span className="capitalize">{meterType}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="prepaid" className="text-gray-900">Prepaid</SelectItem>
                    <SelectItem value="postpaid" className="text-gray-900">Postpaid</SelectItem>
                  </SelectContent>
                </Select>
                {/* Auto-validation status */}
                {validatingMeter && (
                  <div className="w-full h-12 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 mr-2" />
                    <span className="text-sm text-blue-600">Validating meter...</span>
                  </div>
                )}
                {/* Meter Validation Info */}
                {meterValidation && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-sm font-semibold text-green-900 mb-1">Meter Validated</p>
                    <p className="text-xs text-green-700">Name: {meterValidation.customerName}</p>
                    <p className="text-xs text-green-700">Address: {meterValidation.customerAddress}</p>
                  </div>
                )}
              </div>
            )}

            {/* Smart Card Validation Info for Cable TV */}
            {selectedCategory === "cable_tv" && (
              <>
                {validatingSmartCard && (
                  <div className="w-full h-12 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 mr-2" />
                    <span className="text-sm text-blue-600">Validating smart card...</span>
                  </div>
                )}
                {smartCardValidation && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-sm font-semibold text-green-900 mb-1">Smart Card Validated</p>
                    <p className="text-xs text-green-700">Name: {smartCardValidation.customerName}</p>
                    <p className="text-xs text-green-700">Service: {smartCardValidation.service}</p>
                  </div>
                )}
              </>
            )}

            {(ngnAmount || ((selectedCategory === "airtime" || selectedCategory === "electricity") && calculatedTokenAmount)) && (
              <div className="text-left p-3 bg-gray-50 rounded-xl border border-gray-200">
                {(selectedCategory === "airtime" || selectedCategory === "electricity") && calculatedTokenAmount ? (
                  <>
                    <p className="text-sm text-gray-600 mb-1">You will be charged</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {calculatedTokenAmount.toFixed(8)} {selectedToken}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-1">You will receive</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {(() => {
                        // For data bundle, extract and show the data size from bundle description
                        if (selectedCategory === "data_bundle" && selectedBundle) {
                          const bundle = bundles.find(b => b.code === selectedBundle);
                          if (bundle) {
                            // Extract data size from description (e.g., "9MOBILE Daily 50MB" -> "50MB")
                            // Match patterns like: 50MB, 100MB, 1.2GB, 2GB, etc.
                            const dataSizeMatch = bundle.description.match(/(\d+(?:\.\d+)?)\s*(MB|GB|TB)/i);
                            if (dataSizeMatch) {
                              const size = dataSizeMatch[1];
                              const unit = dataSizeMatch[2].toUpperCase();
                              return `${size}${unit} data`;
                            }
                            // Fallback: try to extract any size pattern
                            const fallbackMatch = bundle.description.match(/(\d+(?:\.\d+)?)\s*(MB|GB|TB|mb|gb|tb)/i);
                            if (fallbackMatch) {
                              return `${fallbackMatch[1]}${fallbackMatch[2].toUpperCase()} data`;
                            }
                            // If no size found, show description
                            return bundle.description;
                          }
                        }
                        // For other categories, show NGN amount
                        return `₦${ngnAmount?.toLocaleString()} NGN ${selectedCategory === "electricity" ? "electricity" : selectedCategory === "cable_tv" ? "cable subscription" : "credit"}`;
                      })()}
                    </p>
                  </>
                )}
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
              if (isNaN(inputAmount) || inputAmount <= 0) return true;
              // For airtime and electricity, inputAmount is NGN, so compare calculatedTokenAmount with balance
              // For other categories, inputAmount is tokenAmount, so compare directly
              const tokenAmountToCheck = (selectedCategory === "airtime" || selectedCategory === "electricity") && calculatedTokenAmount !== null
                ? calculatedTokenAmount
                : inputAmount;
              return tokenAmountToCheck > balanceAmount;
            })() ||
            // Validate Nigerian phone number format for airtime and data bundle
            ((selectedCategory === "airtime" || selectedCategory === "data_bundle") && !/^0\d{10}$/.test(phoneNumber || "")) ||
            // Validate minimum NGN amount for airtime (₦100 minimum)
            (selectedCategory === "airtime" && (() => {
              const inputNgnAmount = parseFloat(selectedAmount || "0");
              return !isNaN(inputNgnAmount) && inputNgnAmount < 100;
            })()) ||
            // Validate bundle code for data bundle
            (selectedCategory === "data_bundle" && !selectedBundle) ||
            // Validate meter for electricity
            (selectedCategory === "electricity" && !meterValidation) ||
            // Validate minimum NGN amount for electricity (₦1,000 minimum)
            (selectedCategory === "electricity" && (() => {
              const inputNgnAmount = parseFloat(selectedAmount || "0");
              return !isNaN(inputNgnAmount) && inputNgnAmount < 1000;
            })()) ||
            // Validate smart card and package for cable TV
            (selectedCategory === "cable_tv" && !smartCardValidation) ||
            (selectedCategory === "cable_tv" && !selectedPackage)
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

      {/* Receipt Modal */}
      {showReceipt && receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Transaction Receipt</h2>
              <button
                onClick={() => {
                  setShowReceipt(false);
                  setReceipt(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6" id="receipt-content">
              {/* Header with Biller Logo and Amount */}
              <div className="text-center space-y-2">
                <div className="text-xl font-semibold text-gray-900">{receipt.biller}</div>
                <div className="text-3xl font-bold text-gray-900">₦{receipt.amount.toLocaleString()}</div>
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Successful</span>
                </div>
              </div>

              {/* Token with Copy Functionality */}
              {receipt.token && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Token</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold text-gray-900 tracking-wider break-all font-mono flex-1">
                      {receipt.token}
                    </p>
                    <button
                      onClick={async () => {
                        if (receipt.token) {
                          const success = await copyToClipboard(receipt.token);
                          if (success) {
                            setTokenCopied(true);
                            toast({
                              title: "Copied!",
                              description: "Token copied to clipboard",
                            });
                            setTimeout(() => setTokenCopied(false), 2000);
                          } else {
                            toast({
                              title: "Failed to copy",
                              description: "Please try again",
                              variant: "destructive",
                            });
                          }
                        }
                      }}
                      className="p-1.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      title="Copy token"
                    >
                      {tokenCopied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Transaction Details */}
              <div className="space-y-3 border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Transaction Details</h3>
                {receipt.meterType && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Meter Type:</span>
                    <span className="text-sm font-semibold text-gray-900">{receipt.meterType}</span>
                  </div>
                )}
                {receipt.meterNumber && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Meter Number:</span>
                    <span className="text-sm font-semibold text-gray-900">{receipt.meterNumber}</span>
                  </div>
                )}
                {receipt.customerName && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Customer Name:</span>
                    <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%] break-words">{receipt.customerName}</span>
                  </div>
                )}
                {receipt.customerAddress && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Service Address:</span>
                    <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%] break-words">{receipt.customerAddress}</span>
                  </div>
                )}
                {receipt.unit && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-600">Units Purchased:</span>
                    <span className="text-sm font-semibold text-gray-900">{receipt.unit} kWh</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Transaction No.:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-900">{receipt.transactionId}</span>
                    <button
                      onClick={async () => {
                        const success = await copyToClipboard(receipt.transactionId);
                        if (success) {
                          toast({
                            title: "Copied!",
                            description: "Transaction ID copied to clipboard",
                          });
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Copy className="h-3 w-3 text-gray-500" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Transaction Date:</span>
                  <span className="text-sm font-semibold text-gray-900">{receipt.transactionDate}</span>
                </div>
              </div>

              {/* Action Button - Share as Image */}
              <Button
                type="button"
                onClick={async () => {
                  try {
                    // Use Web Share API if available (mobile)
                    if (navigator.share) {
                      // For now, share as text. Later we can add image sharing
                      const receiptText = `Electricity Token: ${receipt.token}\n` +
                        `Amount: ₦${receipt.amount.toLocaleString()}\n` +
                        `Meter: ${receipt.meterNumber || receipt.recipient}\n` +
                        `Transaction ID: ${receipt.transactionId}\n` +
                        `Date: ${receipt.transactionDate}`;

                      await navigator.share({
                        title: 'Electricity Purchase Receipt',
                        text: receiptText,
                      });
                    } else {
                      // Fallback: Copy receipt text
                      const receiptText = `Electricity Token: ${receipt.token}\n` +
                        `Amount: ₦${receipt.amount.toLocaleString()}\n` +
                        `Meter: ${receipt.meterNumber || receipt.recipient}\n` +
                        `Transaction ID: ${receipt.transactionId}\n` +
                        `Date: ${receipt.transactionDate}`;

                      const success = await copyToClipboard(receiptText);
                      if (success) {
                        toast({
                          title: "Copied!",
                          description: "Receipt details copied to clipboard",
                        });
                      } else {
                        toast({
                          title: "Failed to copy",
                          description: "Please try again",
                          variant: "destructive",
                        });
                      }
                    }
                  } catch (error) {
                    console.error('Error sharing receipt:', error);
                  }
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Receipt
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}