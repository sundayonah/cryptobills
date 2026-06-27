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
    // Better randomization using multiple seeds for more natural distribution
    const seed1 = Math.sin(index * 12.9898) * 43758.5453;
    const seed2 = Math.sin(index * 78.233) * 43758.5453;
    const seed3 = Math.sin(index * 37.719) * 43758.5453;
    const seed4 = Math.sin(index * 94.673) * 43758.5453;
    const random1 = Math.abs(seed1 - Math.floor(seed1));
    const random2 = Math.abs(seed2 - Math.floor(seed2));
    const random3 = Math.abs(seed3 - Math.floor(seed3));
    const random4 = Math.abs(seed4 - Math.floor(seed4));

    // Keep logos away from center area where main component is displayed
    // Better spacing distribution similar to Uniswap
    let initialX, initialY;

    // Horizontal positioning: better coverage across viewport with smaller exclusion
    if (random1 < 0.25) {
        // Left area: 2-38% of viewport
        const normalizedRandom = random1 / 0.25;
        initialX = 2 + normalizedRandom * 36;
    } else if (random1 < 0.4) {
        // Center-left: 38-45% of viewport
        const normalizedRandom = (random1 - 0.25) / 0.15;
        initialX = 38 + normalizedRandom * 7;
    } else if (random1 < 0.6) {
        // Center-right: 55-62% of viewport (smaller exclusion zone: 45-55%)
        const normalizedRandom = (random1 - 0.4) / 0.2;
        initialX = 55 + normalizedRandom * 7;
    } else {
        // Right area: 62-98% of viewport
        const normalizedRandom = (random1 - 0.6) / 0.4;
        initialX = 62 + normalizedRandom * 36;
    }

    // Vertical positioning: better coverage across viewport with smaller exclusion
    if (random2 < 0.2) {
        // Top area: 2-32% of viewport
        const normalizedRandom = random2 / 0.2;
        initialY = 2 + normalizedRandom * 30;
    } else if (random2 < 0.35) {
        // Upper-middle: 32-40% of viewport
        const normalizedRandom = (random2 - 0.2) / 0.15;
        initialY = 32 + normalizedRandom * 8;
    } else if (random2 < 0.65) {
        // Lower-middle: 60-68% of viewport (smaller exclusion zone: 40-60%)
        const normalizedRandom = (random2 - 0.35) / 0.3;
        initialY = 60 + normalizedRandom * 8;
    } else {
        // Bottom area: 68-98% of viewport
        const normalizedRandom = (random2 - 0.65) / 0.35;
        initialY = 68 + normalizedRandom * 30;
    }
    // Animation offset for smooth floating movement
    const offsetX = (random3 - 0.5) * 15; // Slightly more movement for better coverage
    const offsetY = (random4 - 0.5) * 15; // Slightly more movement for better coverage

    // Determine if logo is near swap area (should not have hover effects)
    const isNearSwap = (
        (initialX >= 30 && initialX <= 70) && // Within extended horizontal swap area
        (initialY >= 25 && initialY <= 75)    // Within extended vertical swap area
    );

    return {
        initialX, // 0-100% of viewport
        initialY,
        offsetX, // Animation offset
        offsetY,
        duration: 15 + random1 * 20, // 15-35 seconds for smooth floating
        delay: random2 * 5,
        scale: 0.7 + random3 * 0.4, // 0.7-1.1 for more subtle size variety
        allowHover: !isNearSwap, // Only allow hover effects for logos away from swap
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
        ...LOGOS.map((logo, idx) => ({ ...logo, index: idx + LOGOS.length })), // First duplicate
        ...LOGOS.slice(0, Math.floor(LOGOS.length * 0.7)).map((logo, idx) => ({ ...logo, index: idx + LOGOS.length * 2 })), // Partial third set for more density
    ];

    return (
        <div className="fixed inset-0 overflow-hidden z-[1] hidden md:block" aria-hidden="true" style={{ pointerEvents: 'none' }}>
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
                            zIndex: -1, // Ensure logos stay behind other content
                        }}
                    >
                        <motion.div
                            className={`relative w-16 h-16 md:w-20 md:h-20 ${props.allowHover ? 'cursor-pointer' : ''}`}
                            style={{
                                willChange: "opacity, transform, filter",
                                pointerEvents: props.allowHover ? "auto" : "none", // Only allow interaction for distant logos
                                overflow: "visible", // Ensure logo can expand fully
                            }}
                            initial={{
                                opacity: 0.2, // Slightly more visible to fill gaps
                                scale: props.scale * 0.65, // Slightly larger for better coverage
                                filter: "blur(6px)", // Even less blur for better visibility
                            }}
                            {...(props.allowHover && {
                                whileHover: {
                                    opacity: 0.8, // More visible on hover
                                    scale: props.scale * 0.9, // Scale up on hover
                                    filter: "blur(0px)", // Reduce blur on hover
                                    transition: {
                                        duration: 0.3, // Smooth transition
                                        opacity: { duration: 0.2 },
                                        filter: { duration: 0.2 },
                                        scale: { duration: 0.2 },
                                    },
                                }
                            })}
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