'use client';

import { useEffect } from 'react';
import config from '@/lib/config';
import { usePrivy } from '@privy-io/react-auth';

export default function SupportKitProvider() {
  const { ready, user } = usePrivy();

  useEffect(() => {
    let cancelled = false;

    if (!ready) {
      return;
    }

    if (!user) {
      void import('supportkit-sdk').then(({ SupportKit }) => {
        SupportKit.getInstance()?.destroy();
      });
      return;
    }

    const wallet = user.wallet?.address;
    const email = user.email?.address;
    const id = user.id;

    void import('supportkit-sdk').then(({ SupportKit }) => {
      if (cancelled) return;

      SupportKit.getInstance()?.destroy();

      SupportKit.init({
        apiKey: config.supportkit_api_key,
        position: 'bottom-right',
        user: {
          id,
          name: wallet ?? email ?? 'User',
          email: email ?? undefined,
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [ready, user, user?.id, user?.wallet?.address, user?.email?.address]);

  return null;
}