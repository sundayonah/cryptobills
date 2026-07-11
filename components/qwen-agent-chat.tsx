"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Loader2, Mic, MicOff, Send, X } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useAgentBillPay } from "@/contexts/agent-bill-pay-context";
import { FabTooltip } from "@/components/fab-tooltip";
import config from "@/lib/config";
import { FAB_BOTTOM_QWEN_SOLO, FAB_BOTTOM_QWEN_STACKED } from "@/lib/fab-layout";
import { hasValidNigerianPhone } from "@/lib/voice-transcript-normalize";
import type { AgentBillIntent, AgentChatMessage } from "@/types";

interface ChatEntry extends AgentChatMessage {
  id: string;
  billIntent?: AgentBillIntent;
}

const QWEN_LOGO = "/logos/qwen.png";

const STARTER_MESSAGE: ChatEntry = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I can help you pay Nigerian bills with stablecoins for anyone — airtime, data, electricity, cable TV, and betting top-ups. Just give a valid phone, meter, or account number. Try: “Send ₦1000 MTN airtime to 08012345678” or “Buy 1GB MTN data for 08098765432”. Tap Confirm & pay when ready.",
};

export function QwenAgentChat() {
  const { authenticated, login } = usePrivy();
  const { payBillFromAgent, prefillBillFromAgent, isPaymentRegistered } = useAgentBillPay();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [payingIntentId, setPayingIntentId] = useState<string | null>(null);
  const [paidIntentIds, setPaidIntentIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<ChatEntry[]>([STARTER_MESSAGE]);
  const messagesRef = useRef<ChatEntry[]>([STARTER_MESSAGE]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voiceEnabled = config.qwen_voice_enabled;
  const stackWithSupport = config.supportkit_enabled && authenticated;
  const fabBottom = stackWithSupport ? FAB_BOTTOM_QWEN_STACKED : FAB_BOTTOM_QWEN_SOLO;
  const fabTooltipLabel = voiceEnabled
    ? 'Bill Assistant — say "Hey Qwen" or tap to open'
    : "Bill Assistant — tap to pay bills with AI";

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading, payingIntentId]);

  const sendMessageWithText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: ChatEntry = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };

      const nextMessages = [...messagesRef.current, userMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      try {
        const payload = nextMessages
          .filter((m) => m.id !== "welcome")
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map(({ role, content }) => ({ role, content }));

        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to reach agent");
        }

        setMessages((prev) => {
          const updated = [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant" as const,
              content: data.message,
              billIntent: data.billIntent,
            },
          ];
          messagesRef.current = updated;
          return updated;
        });

        if (data.billIntent) {
          void prefillBillFromAgent(data.billIntent);
        }
      } catch (error: unknown) {
        const description =
          error instanceof Error ? error.message : "Something went wrong. Please try again.";
        setMessages((prev) => {
          const updated = [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant" as const,
              content: description,
            },
          ];
          messagesRef.current = updated;
          return updated;
        });
      } finally {
        setLoading(false);
      }
    },
    [prefillBillFromAgent],
  );

  const { isRecording, isTranscribing, recordingSeconds, toggleRecording } = useVoiceRecorder({
    onTranscript: (text) => {
      if (hasValidNigerianPhone(text)) {
        return sendMessageWithText(text);
      }

      setInput(text);
      toast({
        title: "Phone number looks incomplete",
        description: "Edit the text if needed, then tap send. Say the full 11-digit number before stopping the mic.",
      });
    },
    onError: (message) => {
      toast({
        title: "Voice input failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const sendMessage = async () => {
    if (loading || payingIntentId || isTranscribing || !input.trim()) return;
    await sendMessageWithText(input);
  };

  const handleConfirmPayment = async (messageId: string, intent: AgentBillIntent) => {
    if (!authenticated) {
      login();
      return;
    }

    if (paidIntentIds.has(messageId)) {
      return;
    }

    if (!isPaymentRegistered) {
      toast({
        title: "Payment form not ready",
        description: "Please open the Pay Bilz tab and try again.",
        variant: "destructive",
      });
      return;
    }

    setPayingIntentId(messageId);
    try {
      await payBillFromAgent(intent);
      setPaidIntentIds((prev) => new Set(prev).add(messageId));
      setMessages((prev) => [
        ...prev.map((m) => (m.id === messageId ? { ...m, billIntent: undefined } : m)),
        {
          id: `assistant-paid-${Date.now()}`,
          role: "assistant",
          content: `Payment submitted for ${intent.summary}. Check your wallet and transaction history for status.`,
        },
      ]);
    } catch (error: unknown) {
      const description =
        error instanceof Error ? error.message : "Payment failed. Please try again.";
      toast({
        title: "Payment failed",
        description,
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-pay-error-${Date.now()}`,
          role: "assistant",
          content: description,
        },
      ]);
    } finally {
      setPayingIntentId(null);
    }
  };

  const inputDisabled = loading || Boolean(payingIntentId) || isTranscribing;

  return (
    <>
      {!open && (
        <FabTooltip
          label={fabTooltipLabel}
          className="fixed right-5 z-40"
          style={{ bottom: fabBottom }}
        >
          <button
            type="button"
            data-qwen-fab
            onClick={() => setOpen(true)}
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-black p-2.5 shadow-lg ring-2 ring-gray-200 transition hover:ring-violet-300"
            aria-label="Open Qwen bill assistant"
          >
            <Image
              src={QWEN_LOGO}
              alt="Qwen"
              width={56}
              height={56}
              className="h-full w-full object-contain object-center"
            />
          </button>
        </FabTooltip>
      )}

      {open && (
        <div
          className="fixed right-5 z-40 flex h-[min(560px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          style={{ bottom: fabBottom }}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black p-1">
                <Image
                  src={QWEN_LOGO}
                  alt="Qwen"
                  width={32}
                  height={32}
                  className="h-full w-full object-contain object-center"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Bill Assistant</p>
                <p className="text-xs text-gray-500">Powered by Qwen Cloud</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.role === "user"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-800"
                    }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.billIntent && !paidIntentIds.has(message.id) && (
                    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3 text-gray-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Confirm payment
                      </p>
                      <p className="mt-1 font-medium">{message.billIntent.summary}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        Tap Confirm to open your wallet and pay with USDC/USDT.
                      </p>
                      <Button
                        type="button"
                        disabled={payingIntentId === message.id || paidIntentIds.has(message.id)}
                        onClick={() => void handleConfirmPayment(message.id, message.billIntent!)}
                        className="mt-3 w-full rounded-xl bg-gray-900 hover:bg-gray-800"
                      >
                        {payingIntentId === message.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Confirming...
                          </>
                        ) : (
                          "Confirm & pay"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(loading || isTranscribing) && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isTranscribing ? "Transcribing..." : "Thinking..."}
              </div>
            )}
            {isRecording && (
              <div className="flex flex-col gap-1 text-sm text-red-600">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Recording {recordingSeconds}s — keep mic on until you finish the phone number
                </div>
                <p className="text-xs text-gray-500">Tap mic again when done</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
            >
              {voiceEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={inputDisabled}
                  onClick={() => toggleRecording()}
                  className={`rounded-xl shrink-0 ${isRecording ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" : ""
                    }`}
                  aria-label={isRecording ? "Stop recording" : "Start voice input"}
                  title={isRecording ? "Stop recording" : "Speak your bill request"}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={voiceEnabled ? "Type or use the mic..." : "Ask to pay a bill..."}
                disabled={inputDisabled}
                className="rounded-xl"
              />
              <Button
                type="submit"
                disabled={inputDisabled || !input.trim()}
                className="rounded-xl bg-gray-900 hover:bg-gray-800 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
