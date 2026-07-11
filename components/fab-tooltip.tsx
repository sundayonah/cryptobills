"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FabTooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function FabTooltip({ label, children, className, style }: FabTooltipProps) {
  return (
    <div className={cn("group/fab relative", className)} style={style}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 z-50 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/fab:opacity-100 group-focus-within/fab:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
