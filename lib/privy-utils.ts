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
 * Get wallet type from Privy user object
 * Returns: 'embedded' | 'external' | 'smart_wallet' | null
 */
export function getWalletTypeFromPrivyUser(user: any): string | null {
  if (!user) return null;

  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    // Check for embedded wallet
    const embeddedWallet = user.linkedAccounts.find(
      (account: any) =>
        account.type === 'wallet' && account.connectorType === 'embedded'
    );
    if (embeddedWallet) return 'embedded';

    // Check for smart wallet
    const smartWallet = user.linkedAccounts.find(
      (account: any) => account.type === 'smart_wallet'
    );
    if (smartWallet) return 'smart_wallet';

    // Check for external wallet
    const externalWallet = user.linkedAccounts.find(
      (account: any) =>
        account.type === 'wallet' && account.connectorType !== 'embedded'
    );
    if (externalWallet) return 'external';
  }

  // Fallback: if user has wallet but no linkedAccounts, assume external
  if (user.wallet?.address) {
    return 'external';
  }

  return null;
}

/**
 * Get login provider from Privy user object
 * Returns: 'email' | 'metamask' | 'phantom' | 'wallet_connect' | 'coinbase_wallet' | 'rainbow' | 'trust_wallet' | 'embedded' | null
 */
export function getLoginProviderFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts for the primary login method
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    // Check for email account (usually the first linked account if user logged in with email)
    const emailAccount = user.linkedAccounts.find(
      (account: any) => account.type === 'email'
    );
    if (emailAccount) {
      // If email account exists, check if they have an embedded wallet (email login)
      const embeddedWallet = user.linkedAccounts.find(
        (account: any) =>
          account.type === 'wallet' && account.connectorType === 'embedded'
      );
      if (embeddedWallet) return 'email';
    }

    // Check for wallet accounts and their connector types
    const walletAccount = user.linkedAccounts.find(
      (account: any) => account.type === 'wallet'
    );

    if (walletAccount) {
      const connectorType = walletAccount.connectorType?.toLowerCase() || '';
      const walletClientType = walletAccount.walletClientType?.toLowerCase() || '';

      // Map connector types to provider names
      if (connectorType === 'metamask' || walletClientType === 'metamask') {
        return 'metamask';
      }
      if (connectorType === 'phantom' || walletClientType === 'phantom') {
        return 'phantom';
      }
      if (connectorType === 'wallet_connect' || walletClientType === 'wallet_connect') {
        return 'wallet_connect';
      }
      if (connectorType === 'coinbase_wallet' || walletClientType === 'coinbase_wallet') {
        return 'coinbase_wallet';
      }
      if (connectorType === 'rainbow' || walletClientType === 'rainbow') {
        return 'rainbow';
      }
      if (connectorType === 'trust_wallet' || walletClientType === 'trust_wallet') {
        return 'trust_wallet';
      }
      if (connectorType === 'embedded') {
        return 'embedded';
      }

      // Fallback: return connectorType if it exists
      if (connectorType) return connectorType;
    }
  }

  // Check user.wallet for direct connections
  if (user.wallet) {
    const walletType = user.wallet.walletClientType?.toLowerCase() || '';
    if (walletType === 'metamask') return 'metamask';
    if (walletType === 'phantom') return 'phantom';
    if (walletType === 'coinbase_wallet') return 'coinbase_wallet';
    if (walletType === 'rainbow') return 'rainbow';
    if (walletType === 'trust_wallet') return 'trust_wallet';
  }

  // Check for email in user object
  if (user.email) {
    return 'email';
  }

  return null;
}

/**
 * Get email from Privy user object
 */
export function getEmailFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts for email
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    const emailAccount = user.linkedAccounts.find(
      (account: any) => account.type === 'email'
    );
    if (emailAccount?.address) {
      return emailAccount.address;
    }
  }

  // Fallback: check user.email
  if (user.email) {
    return user.email;
  }

  return null;
}
