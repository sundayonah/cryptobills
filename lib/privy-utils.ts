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

/**
 * Get email from Privy user object
 */
export function getEmailFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check user.email.address first
  if (user.email?.address) {
    return user.email.address;
  }

  // Check linkedAccounts for email accounts
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    const emailAccount = user.linkedAccounts.find(
      (account: any) => account.type === 'email'
    );
    if (emailAccount?.address) {
      return emailAccount.address;
    }
  }

  return null;
}

/**
 * Get login provider from Privy user object
 */
export function getLoginProviderFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts for the login method
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    // Find the first linked account to determine login method
    const firstAccount = user.linkedAccounts[0];
    if (firstAccount) {
      if (firstAccount.type === 'email') return 'email';
      if (firstAccount.type === 'wallet') {
        // Check connectorType for wallet provider
        if (firstAccount.connectorType === 'metamask') return 'metamask';
        if (firstAccount.connectorType === 'phantom') return 'phantom';
        if (firstAccount.connectorType === 'wallet_connect') return 'wallet_connect';
        if (firstAccount.connectorType === 'coinbase_wallet') return 'coinbase_wallet';
        if (firstAccount.connectorType === 'embedded') return 'embedded_wallet';
        return 'wallet';
      }
    }
  }

  // Check user.wallet for direct wallet connections
  if (user.wallet?.address) {
    return 'wallet';
  }

  return null;
}

/**
 * Get wallet type from Privy user object
 */
export function getWalletTypeFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts for wallet type
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    const wallet = user.linkedAccounts.find(
      (account: any) => account.type === 'wallet' || account.type === 'smart_wallet'
    );
    if (wallet) {
      if (wallet.connectorType === 'embedded') return 'embedded';
      if (wallet.type === 'smart_wallet') return 'smart_wallet';
      return 'external';
    }
  }

  // Check user.wallet
  if (user.wallet?.address) {
    return 'external';
  }

  return null;
}
