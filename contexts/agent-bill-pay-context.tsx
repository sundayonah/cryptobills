"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentBillIntent } from "@/types";

type PayBillFn = (intent: AgentBillIntent) => Promise<void>;
type PrefillBillFn = (intent: AgentBillIntent) => Promise<void>;

interface AgentBillPayContextValue {
  payBillFromAgent: (intent: AgentBillIntent) => Promise<void>;
  prefillBillFromAgent: (intent: AgentBillIntent) => Promise<void>;
  /** @deprecated Use payBillFromAgent */
  payAirtimeFromAgent: (intent: AgentBillIntent) => Promise<void>;
  registerBillPayment: (fn: PayBillFn | null) => void;
  registerBillPrefill: (fn: PrefillBillFn | null) => void;
  /** @deprecated Use registerBillPayment */
  registerAirtimePayment: (fn: PayBillFn | null) => void;
  isPaymentRegistered: boolean;
  onEnsureBillsTab?: () => void;
}

const AgentBillPayContext = createContext<AgentBillPayContextValue | null>(null);

export function AgentBillPayProvider({
  children,
  onEnsureBillsTab,
}: {
  children: ReactNode;
  onEnsureBillsTab?: () => void;
}) {
  const payFnRef = useRef<PayBillFn | null>(null);
  const prefillFnRef = useRef<PrefillBillFn | null>(null);
  const [isPaymentRegistered, setIsPaymentRegistered] = useState(false);

  const registerBillPayment = useCallback((fn: PayBillFn | null) => {
    payFnRef.current = fn;
    setIsPaymentRegistered(Boolean(fn));
  }, []);

  const registerBillPrefill = useCallback((fn: PrefillBillFn | null) => {
    prefillFnRef.current = fn;
  }, []);

  const payBillFromAgent = useCallback(async (intent: AgentBillIntent) => {
    if (!payFnRef.current) {
      throw new Error("Payment form is not ready. Please open the Pay Bilz tab and try again.");
    }
    onEnsureBillsTab?.();
    await payFnRef.current(intent);
  }, [onEnsureBillsTab]);

  const prefillBillFromAgent = useCallback(async (intent: AgentBillIntent) => {
    onEnsureBillsTab?.();
    if (prefillFnRef.current) {
      await prefillFnRef.current(intent);
    }
  }, [onEnsureBillsTab]);

  return (
    <AgentBillPayContext.Provider
      value={{
        payBillFromAgent,
        prefillBillFromAgent,
        payAirtimeFromAgent: payBillFromAgent,
        registerBillPayment,
        registerBillPrefill,
        registerAirtimePayment: registerBillPayment,
        isPaymentRegistered,
        onEnsureBillsTab,
      }}
    >
      {children}
    </AgentBillPayContext.Provider>
  );
}

export function useAgentBillPay(): AgentBillPayContextValue {
  const context = useContext(AgentBillPayContext);
  if (!context) {
    throw new Error("useAgentBillPay must be used within AgentBillPayProvider");
  }
  return context;
}
