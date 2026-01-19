"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState, useEffect } from "react";

const STATIC_LOGOS = [
    // Networks
    { type: "network", name: "Ethereum", path: "/logos/ethereum-logo.svg" },
    { type: "network", name: "Polygon", path: "/logos/polygon-logo.svg" },
    { type: "network", name: "Arbitrum", path: "/logos/arbitrum-one-logo.svg" },
    { type: "network", name: "Base", path: "/logos/base-logo.svg" },
    // Tokens
    { type: "token", name: "USDC", path: "/logos/usdc-logo.svg" },
    { type: "token", name: "USDT", path: "/logos/usdt-logo.svg" },
];

// Generate random positions and animations for each logo instance
const generateLogoProps = (index: number) => {
    // Use index as seed for consistent randomness
    const seed = index * 7919; // Prime number for better distribution
    const random1 = (seed % 1000) / 1000;
    const random2 = ((seed * 7919) % 1000) / 1000;
    const random3 = ((seed * 7919 * 7919) % 1000) / 1000;
    const random4 = ((seed * 7919 * 7919 * 7919) % 1000) / 1000;

    // Keep logos away from center area where main component is displayed
    // Better spacing distribution similar to Uniswap
    let initialX, initialY;

    // Horizontal positioning: prefer edges, avoid center (wider distribution)
    if (random1 < 0.4) {
        // Left side: 3-25% of viewport
        initialX = 3 + random1 * 22;
    } else if (random1 > 0.6) {
        // Right side: 75-97% of viewport
        initialX = 75 + (random1 - 0.6) * 22;
    } else {
        // Center edges: 25-35% or 65-75% (avoiding main component area)
        if (random1 < 0.5) {
            initialX = 25 + (random1 - 0.4) * 10;
        } else {
            initialX = 65 + (random1 - 0.5) * 10;
        }
    }

    // Vertical positioning: better distribution across all areas
    if (random2 < 0.3) {
        // Top area: 3-25% of viewport
        initialY = 3 + random2 * 22;
    } else if (random2 > 0.7) {
        // Bottom area: 75-97% of viewport
        initialY = 75 + (random2 - 0.7) * 22;
    } else {
        // Middle areas: 25-35% or 65-75% (avoiding main component)
        if (random2 < 0.5) {
            initialY = 25 + (random2 - 0.3) * 10;
        } else {
            initialY = 65 + (random2 - 0.5) * 10;
        }
    }
    // Reduce animation offset to prevent hover loop (logos move less)
    const offsetX = (random3 - 0.5) * 10; // Reduced from 20 to 10
    const offsetY = (random4 - 0.5) * 10; // Reduced from 20 to 10

    return {
        initialX, // 0-100% of viewport
        initialY,
        offsetX, // Animation offset
        offsetY,
        duration: 15 + random1 * 20, // 15-35 seconds for smooth floating
        delay: random2 * 5,
        scale: 0.8 + random3 * 0.6, // 0.8-1.4 for size variety
    };
};

export function FloatingLogosBackground() {
    const [providerLogos, setProviderLogos] = useState<Array<{ type: string; name: string; path: string }>>([]);

    // Fetch providers from API for airtime, electricity, and cable_tv
    useEffect(() => {
        const fetchProviders = async () => {
            const categories: Array<'airtime' | 'electricity' | 'cable_tv'> = ['airtime', 'electricity', 'cable_tv'];
            const allProviders: Array<{ type: string; name: string; path: string }> = [];

            for (const category of categories) {
                try {
                    const response = await fetch(`/api/providers?category=${category}`);
                    const data = await response.json();

                    if (data.status === 'successful' && data.data && Array.isArray(data.data)) {
                        // Extract unique providers with logos
                        const providers = data.data
                            .filter((provider: any) => provider.logo && provider.name)
                            .map((provider: any) => ({
                                type: "provider",
                                name: provider.name,
                                path: provider.logo,
                            }));

                        // Add providers, avoiding duplicates by name
                        providers.forEach((provider: { type: string; name: string; path: string }) => {
                            if (!allProviders.find(p => p.name === provider.name && p.type === provider.type)) {
                                allProviders.push(provider);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching ${category} providers:`, error);
                }
            }

            setProviderLogos(allProviders);
        };

        fetchProviders();
    }, []);

    // Combine static logos with fetched provider logos
    const LOGOS = [...STATIC_LOGOS, ...providerLogos];

    // Create multiple instances of each logo for a denser effect
    const LOGO_INSTANCES = [
        ...LOGOS,
        ...LOGOS.map((logo, idx) => ({ ...logo, index: idx + LOGOS.length })), // Duplicate for density
    ];

    return (
        <div className="fixed inset-0 overflow-hidden z-[11] hidden md:block" aria-hidden="true" style={{ pointerEvents: 'none' }}>
            {LOGO_INSTANCES.map((logo, index) => {
                const props = generateLogoProps(index);
                return (
                    <motion.div
                        key={`${logo.type}-${logo.name}-${index}`}
                        className="absolute"
                        initial={{
                            x: `${props.initialX}vw`,
                            y: `${props.initialY}vh`,
                        }}
                        animate={{
                            x: [
                                `${props.initialX}vw`,
                                `${props.initialX + props.offsetX}vw`,
                                `${props.initialX}vw`,
                            ],
                            y: [
                                `${props.initialY}vh`,
                                `${props.initialY + props.offsetY}vh`,
                                `${props.initialY}vh`,
                            ],
                        }}
                        transition={{
                            x: {
                                duration: props.duration,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: props.delay,
                            },
                            y: {
                                duration: props.duration,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: props.delay,
                            },
                        }}
                        style={{
                            willChange: "transform",
                            pointerEvents: "none", // Container doesn't capture pointer events
                            overflow: "visible", // Allow logo to expand beyond container
                        }}
                    >
                        <motion.div
                            className="relative w-16 h-16 md:w-20 md:h-20 cursor-pointer"
                            style={{
                                willChange: "opacity, transform, filter",
                                pointerEvents: "auto", // Only the image div captures hover
                                overflow: "visible", // Ensure logo can expand fully
                            }}
                            initial={{
                                opacity: 0.3,
                                scale: props.scale * 0.5, // Smaller by default
                                filter: "blur(15px)",
                            }}
                            whileHover={{
                                opacity: 1,
                                scale: props.scale, // Full size on hover
                                filter: "blur(0px)",
                                transition: {
                                    duration: 0.2, // Fast transition on hover
                                    opacity: { duration: 0.1 }, // Very fast return
                                    filter: { duration: 0.1 }, // Very fast return
                                    scale: { duration: 0.1 }, // Very fast return
                                },
                            }}
                        >
                            <Image
                                src={logo.path}
                                alt={logo.name}
                                fill
                                className="object-contain"
                                unoptimized
                                loading={index < 3 ? "eager" : "lazy"} // Only first 3 load eagerly
                                onError={(e) => {
                                    // Silently handle errors for provider logos that may not load
                                    if (logo.type !== "provider") {
                                        console.error(`Failed to load logo: ${logo.path}`, e);
                                    }
                                }}
                            />
                        </motion.div>
                    </motion.div>
                );
            })}
        </div>
    );
}