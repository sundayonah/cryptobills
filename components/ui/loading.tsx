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

// Skeleton loader for the airtime swap form
export function AirtimeFormSkeleton() {
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-lg space-y-4">
            {/* Service Type Skeleton */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-4 w-24" />
                <LoadingSkeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Network Skeleton */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-4 w-20" />
                <LoadingSkeleton className="h-14 w-full rounded-xl bg-purple-50" />
            </div>

            {/* Send Section Skeleton */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <LoadingSkeleton className="h-4 w-16" />
                    <LoadingSkeleton className="h-3 w-12" />
                </div>
                <div className="flex gap-2">
                    <LoadingSkeleton className="h-16 flex-1 rounded-xl" />
                    <LoadingSkeleton className="h-16 w-[180px] rounded-xl" />
                </div>
            </div>

            {/* Phone Number Skeleton */}
            <div className="space-y-2">
                <LoadingSkeleton className="h-3 w-28" />
                <LoadingSkeleton className="h-14 w-full rounded-xl" />
            </div>

            {/* Receive Amount Skeleton */}
            <div className="py-3 bg-gray-50 rounded-xl border border-gray-200">
                <LoadingSkeleton className="h-3 w-32 mx-auto mb-2" />
                <LoadingSkeleton className="h-6 w-40 mx-auto" />
            </div>

            {/* Purchase Button Skeleton */}
            <LoadingSkeleton className="h-14 w-full rounded-xl" />
        </div>
    );
}
