"use client";

import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LoadingProps {
    text?: string;
    size?: "sm" | "md" | "lg";
    className?: string;
    fullScreen?: boolean;
}

export function Loading({
    text = "Loading...",
    size = "md",
    className,
    fullScreen = false
}: LoadingProps) {
    const sizeClasses = {
        sm: "h-4 w-4",
        md: "h-8 w-8",
        lg: "h-12 w-12",
    };

    const textSizeClasses = {
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
    };

    const content = (
        <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
            <motion.div
                animate={{ rotate: 360 }}
                transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "linear",
                }}
            >
                <Loader2 className={cn(sizeClasses[size], "text-gray-600")} />
            </motion.div>
            {text && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className={cn("text-gray-500 font-medium", textSizeClasses[size])}
                >
                    {text}
                </motion.p>
            )}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                {content}
            </div>
        );
    }

    return content;
}

// Compact loading spinner for inline use
export function LoadingSpinner({
    size = "md",
    className
}: {
    size?: "sm" | "md" | "lg";
    className?: string;
}) {
    const sizeClasses = {
        sm: "h-3 w-3",
        md: "h-4 w-4",
        lg: "h-5 w-5",
    };

    return (
        <motion.div
            animate={{ rotate: 360 }}
            transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
            }}
            className={className}
        >
            <Loader2 className={cn(sizeClasses[size], "text-gray-400")} />
        </motion.div>
    );
}

// Skeleton loader for content placeholders
export function LoadingSkeleton({
    className,
    count = 1
}: {
    className?: string;
    count?: number;
}) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.1,
                    }}
                    className={cn("bg-gray-200 rounded", className)}
                />
            ))}
        </>
    );
}

/** Skeleton for the Pay Bills / Deposit tab switcher on the home page. */
export function ViewToggleSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl">
            <LoadingSkeleton className="h-10 w-full rounded-xl" />
            <LoadingSkeleton className="h-10 w-full rounded-xl" />
        </div>
    );
}

// Skeleton loader for the title section
export function TitleSkeleton() {
    return (
        <div className="text-center mb-12">
            <div className="space-y-4">
                {/* First line: "Change stablecoins" */}
                <div className="flex items-center justify-center gap-2">
                    <LoadingSkeleton className="h-16 md:h-20 w-32 md:w-40 rounded" />
                    <LoadingSkeleton className="h-16 md:h-20 w-48 md:w-56 rounded" />
                </div>
                {/* Second line: "to airtime in seconds" */}
                <div className="flex items-center justify-center gap-2">
                    <LoadingSkeleton className="h-12 md:h-16 w-16 md:w-20 rounded" />
                    <LoadingSkeleton className="h-12 md:h-16 w-32 md:w-40 rounded" />
                    <LoadingSkeleton className="h-12 md:h-16 w-16 md:w-20 rounded" />
                    <LoadingSkeleton className="h-12 md:h-16 w-32 md:w-40 rounded" />
                </div>
            </div>
        </div>
    );
}

// Skeleton loader for the airtime swap form (aligns with AirtimeSwapCard: Service, Provider, Amount+token, Phone, CTA)
export function AirtimeFormSkeleton() {
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-lg space-y-4">
            {/* Service Type */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-4 w-24 rounded" />
                <LoadingSkeleton className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50" />
            </div>

            {/* Provider */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-4 w-16 rounded" />
                <LoadingSkeleton className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50" />
            </div>

            {/* Amount (NGN) + stablecoin selector */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-4 w-28 rounded" />
                <div className="flex gap-2">
                    <LoadingSkeleton className="h-12 min-h-12 flex-1 rounded-2xl border border-gray-200 bg-gray-50" />
                    <LoadingSkeleton className="h-12 w-[180px] shrink-0 rounded-2xl border border-gray-200 bg-gray-50" />
                </div>
            </div>

            {/* Phone Number (label uses text-xs in the real form) */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-3 w-28 rounded" />
                <LoadingSkeleton className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50" />
            </div>

            {/* Purchase / Sign in button */}
            <LoadingSkeleton className="h-12 w-full rounded-xl" />
        </div>
    );
}

/** Skeleton for the fiat deposit card (matches DepositFiatCard layout). */
export function DepositFormSkeleton() {
    return (
        <div className="w-full rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="space-y-2">
                <LoadingSkeleton className="h-3 w-24" />
                <LoadingSkeleton className="h-12 w-full rounded-2xl" />
            </div>
            <div className="space-y-2">
                <LoadingSkeleton className="h-3 w-16" />
                <div className="flex h-12 items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-3">
                    <LoadingSkeleton className="h-6 flex-1 rounded-lg" />
                    <LoadingSkeleton className="h-8 w-[150px] rounded-xl" />
                </div>
                <LoadingSkeleton className="h-3 w-48" />
            </div>
            <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <LoadingSkeleton className="h-4 w-full max-w-[280px]" />
                <LoadingSkeleton className="h-4 w-32" />
            </div>
            <LoadingSkeleton className="h-12 w-full rounded-xl" />
        </div>
    );
}
