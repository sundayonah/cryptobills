import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    getWalletAddressFromPrivyUser,
    getEmailFromPrivyUser,
    getLoginProviderFromPrivyUser,
    getWalletTypeFromPrivyUser,
} from '@/lib/privy-utils';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { privyUserId, walletAddress: providedWalletAddress, user: privyUser } = body;

        if (!privyUserId) {
            return NextResponse.json(
                { error: 'privyUserId is required' },
                { status: 400 }
            );
        }

        // Extract wallet address if not provided
        let walletAddress = providedWalletAddress;
        if (!walletAddress && privyUser) {
            walletAddress = getWalletAddressFromPrivyUser(privyUser);
        }

        // For email-only users, walletAddress might be null (embedded wallet created later)
        // We'll use privyUserId as the unique identifier in that case
        if (!walletAddress) {
            // Try to find user by privyUserId only
            const existingUser = await prisma.user.findUnique({
                where: { privyUserId },
            });

            if (existingUser) {
                // Update existing user
                const email = privyUser ? getEmailFromPrivyUser(privyUser) : body.email || null;
                const loginProvider = privyUser ? getLoginProviderFromPrivyUser(privyUser) : body.loginProvider || null;
                const walletType = privyUser ? getWalletTypeFromPrivyUser(privyUser) : body.walletType || null;

                const now = new Date();
                const updatedUser = await prisma.user.update({
                    where: { id: existingUser.id },
                    data: {
                        email: email || existingUser.email,
                        loginProvider: loginProvider || existingUser.loginProvider,
                        walletType: walletType || existingUser.walletType,
                        loginCount: { increment: 1 },
                        lastLoginAt: now,
                        firstLoginAt: existingUser.firstLoginAt || now,
                    },
                });

                return NextResponse.json({
                    success: true,
                    user: {
                        id: updatedUser.id,
                        walletAddress: updatedUser.walletAddress,
                        privyUserId: updatedUser.privyUserId,
                        email: updatedUser.email,
                        loginProvider: updatedUser.loginProvider,
                        walletType: updatedUser.walletType,
                        loginCount: updatedUser.loginCount,
                    },
                });
            }

            // If no wallet address and no existing user, we can't create a user without walletAddress
            // This shouldn't happen with embedded wallets, but handle gracefully
            return NextResponse.json(
                { error: 'Wallet address is required for new users' },
                { status: 400 }
            );
        }

        // Extract user details from Privy user object if provided
        const email = privyUser ? getEmailFromPrivyUser(privyUser) : body.email || null;
        const loginProvider = privyUser ? getLoginProviderFromPrivyUser(privyUser) : body.loginProvider || null;
        const walletType = privyUser ? getWalletTypeFromPrivyUser(privyUser) : body.walletType || null;

        // Find existing user - prioritize exact matches to prevent merging unrelated accounts
        // First try to find by both walletAddress and privyUserId (exact match)
        let user = await prisma.user.findFirst({
            where: {
                AND: [
                    walletAddress ? { walletAddress: walletAddress.toLowerCase() } : {},
                    privyUserId ? { privyUserId } : {},
                ].filter(condition => Object.keys(condition).length > 0),
            },
        });

        // If no exact match, find by walletAddress only (if provided)
        if (!user && walletAddress) {
            user = await prisma.user.findUnique({
                where: { walletAddress: walletAddress.toLowerCase() },
            });
        }

        // If still no match, find by privyUserId only (if provided)
        if (!user && privyUserId) {
            user = await prisma.user.findUnique({
                where: { privyUserId },
            });
        }

        const now = new Date();

        if (user) {
            // Update existing user
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    privyUserId: privyUserId,
                    walletAddress: walletAddress.toLowerCase(),
                    email: email || user.email,
                    loginProvider: loginProvider || user.loginProvider,
                    walletType: walletType || user.walletType,
                    loginCount: { increment: 1 },
                    lastLoginAt: now,
                    // Set firstLoginAt if not already set
                    firstLoginAt: user.firstLoginAt || now,
                },
            });
        } else {
            // Create new user
            user = await prisma.user.create({
                data: {
                    privyUserId: privyUserId,
                    walletAddress: walletAddress.toLowerCase(),
                    email: email,
                    loginProvider: loginProvider,
                    walletType: walletType,
                    loginCount: 1,
                    firstLoginAt: now,
                    lastLoginAt: now,
                },
            });
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                privyUserId: user.privyUserId,
                email: user.email,
                loginProvider: user.loginProvider,
                walletType: user.walletType,
                loginCount: user.loginCount,
            },
        });
    } catch (error: any) {
        // Log sanitized error to avoid exposing sensitive user information
        console.error('Error syncing user:', {
            error: error instanceof Error ? error.name : 'Unknown error',
            message: error.message ? 'Error occurred' : 'Unknown error',
            // Don't log full error message as it may contain user data
        });
        return NextResponse.json(
            { error: 'Failed to sync user' },
            { status: 500 }
        );
    }
}
