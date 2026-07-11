'use client';

import { useEffect } from 'react';
import config from '@/lib/config';
import { applySupportKitLauncherLayout, teardownSupportKitFabLayout } from '@/lib/fab-layout';
import { usePrivy } from '@privy-io/react-auth';

function patchSupportKitLauncher(qwenEnabled: boolean) {
  let attempts = 0;
  const maxAttempts = 30;

  const tryPatch = () => {
    if (applySupportKitLauncherLayout({ qwenEnabled })) return;
    attempts += 1;
    if (attempts < maxAttempts) {
      window.setTimeout(tryPatch, 200);
    }
  };

  tryPatch();
}

export default function SupportKitProvider() {
  const { ready, user } = usePrivy();
  const qwenEnabled = config.qwen_agent_enabled;

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    if (!config.supportkit_enabled || !config.supportkit_api_key) {
      void import('supportkit-sdk').then(({ SupportKit }) => {
        SupportKit.getInstance()?.destroy();
      });
      teardownSupportKitFabLayout();
      return;
    }

    if (!ready) {
      return;
    }

    if (!user) {
      void import('supportkit-sdk').then(({ SupportKit }) => {
        SupportKit.getInstance()?.destroy();
      });
      teardownSupportKitFabLayout();
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
        theme: {
          primaryColor: '#000000',
          textColor: '#000000',
          backgroundColor: '#ffffff',
          fontFamily: 'Inter',
          zIndex: 40,
        },
      });

      patchSupportKitLauncher(qwenEnabled);

      observer = new MutationObserver(() => {
        applySupportKitLauncherLayout({ qwenEnabled });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      teardownSupportKitFabLayout();
    };
  }, [ready, user, user?.id, user?.wallet?.address, user?.email?.address, qwenEnabled]);

  return null;
}
