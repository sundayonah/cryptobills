import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const syncUserSchema = z.object({
  walletAddress: z.string().min(1),
  privyUserId: z.string().optional(),
  loginProvider: z.string().optional(),
  walletType: z.string().optional(),
  email: z.string().email().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = syncUserSchema.parse(body);

    const now = new Date();

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { walletAddress: validated.walletAddress },
          ...(validated.privyUserId ? [{ privyUserId: validated.privyUserId }] : []),
        ],
      },
    });

    if (existingUser) {
      // Update existing user
      const isFirstLogin = !existingUser.firstLoginAt;
      
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          walletAddress: validated.walletAddress, // Update in case it changed
          privyUserId: validated.privyUserId || existingUser.privyUserId,
          loginProvider: validated.loginProvider || existingUser.loginProvider,
          walletType: validated.walletType || existingUser.walletType,
          email: validated.email || existingUser.email,
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
          loginProvider: updatedUser.loginProvider,
          loginCount: updatedUser.loginCount,
          isNewUser: false,
        },
      });
    } else {
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          walletAddress: validated.walletAddress,
          privyUserId: validated.privyUserId,
          loginProvider: validated.loginProvider,
          walletType: validated.walletType,
          email: validated.email,
          loginCount: 1,
          firstLoginAt: now,
          lastLoginAt: now,
        },
      });

      return NextResponse.json({
        success: true,
        user: {
          id: newUser.id,
          walletAddress: newUser.walletAddress,
          loginProvider: newUser.loginProvider,
          loginCount: newUser.loginCount,
          isNewUser: true,
        },
      });
    }
  } catch (error: any) {
    console.error('User sync error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to sync user', message: error.message },
      { status: 500 }
    );
  }
}
