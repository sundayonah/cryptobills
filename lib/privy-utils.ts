/**
 * Get wallet address from Privy user object
 * Checks linkedAccounts for embedded wallets, smart wallets, and external wallets
 * Priority: embedded wallet > smart wallet > any wallet > user.wallet
 */
export function getWalletAddressFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts first (most reliable for embedded wallets)
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    // Priority 1: Find embedded wallet (connectorType: 'embedded')
    const embeddedWallet = user.linkedAccounts.find(
      (account: any) =>
        account.type === 'wallet' && account.connectorType === 'embedded'
    );

    if (embeddedWallet?.address) {
      return embeddedWallet.address.toLowerCase();
    }

    // Priority 2: Find smart wallet
    const smartWallet = user.linkedAccounts.find(
      (account: any) => account.type === 'smart_wallet'
    );

    if (smartWallet?.address) {
      return smartWallet.address.toLowerCase();
    }

    // Priority 3: Find any wallet account (fallback)
    const anyWallet = user.linkedAccounts.find(
      (account: any) => account.type === 'wallet' && account.address
    );

    if (anyWallet?.address) {
      return anyWallet.address.toLowerCase();
    }
  }

  // Fallback: check user.wallet (for direct wallet connections)
  if (user.wallet?.address) {
    return user.wallet.address.toLowerCase();
  }

  return null;
}
