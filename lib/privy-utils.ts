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
 * Uses metadata (firstVerifiedAt/latestVerifiedAt) to determine the most recent or primary login method
 */
export function getLoginProviderFromPrivyUser(user: any): string | null {
  if (!user) return null;

  // Check linkedAccounts for the login method
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    // Sort by latestVerifiedAt to get the most recently verified account (primary login method)
    const sortedAccounts = [...user.linkedAccounts].sort((a: any, b: any) => {
      const aTime = a.latestVerifiedAt || a.firstVerifiedAt || 0;
      const bTime = b.latestVerifiedAt || b.firstVerifiedAt || 0;
      return bTime - aTime; // Most recent first
    });

    // Get the most recently verified account
    const primaryAccount = sortedAccounts[0];

    if (primaryAccount) {
      if (primaryAccount.type === 'email') return 'email';
      if (primaryAccount.type === 'wallet') {
        // Check connectorType for wallet provider
        if (primaryAccount.connectorType === 'metamask') return 'metamask';
        if (primaryAccount.connectorType === 'phantom') return 'phantom';
        if (primaryAccount.connectorType === 'wallet_connect') return 'wallet_connect';
        if (primaryAccount.connectorType === 'coinbase_wallet') return 'coinbase_wallet';
        if (primaryAccount.connectorType === 'embedded') return 'embedded_wallet';
        return 'wallet';
      }
      // Handle other account types if needed
      if (primaryAccount.type === 'sms') return 'sms';
      if (primaryAccount.type === 'google') return 'google';
      if (primaryAccount.type === 'twitter') return 'twitter';
      if (primaryAccount.type === 'discord') return 'discord';
      if (primaryAccount.type === 'github') return 'github';
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

/**
 * Get all linked wallet accounts from Privy user
 * Returns both embedded and external wallets with their details
 */
export function getLinkedWalletsFromPrivyUser(user: any): Array<{
  address: string;
  type: 'embedded' | 'external' | 'smart_wallet';
  connectorType?: string;
  connectorName: string;
  isGasSponsored: boolean;
}> {
  if (!user) return [];

  const wallets: Array<{
    address: string;
    type: 'embedded' | 'external' | 'smart_wallet';
    connectorType?: string;
    connectorName: string;
    isGasSponsored: boolean;
  }> = [];

  // Check linkedAccounts for all wallet types
  if (user.linkedAccounts && Array.isArray(user.linkedAccounts)) {
    user.linkedAccounts.forEach((account: any) => {
      if ((account.type === 'wallet' || account.type === 'smart_wallet') && account.address) {
        const isEmbedded = account.connectorType === 'embedded';
        const isSmartWallet = account.type === 'smart_wallet';
        
        wallets.push({
          address: account.address.toLowerCase(),
          type: isEmbedded ? 'embedded' : isSmartWallet ? 'smart_wallet' : 'external',
          connectorType: account.connectorType,
          connectorName: getConnectorDisplayName(account.connectorType),
          isGasSponsored: isEmbedded || isSmartWallet, // Only embedded/smart wallets are gas sponsored
        });
      }
    });
  }

  // Check user.wallet for direct connections
  if (user.wallet?.address) {
    const existingWallet = wallets.find(w => w.address === user.wallet.address.toLowerCase());
    if (!existingWallet) {
      wallets.push({
        address: user.wallet.address.toLowerCase(),
        type: 'external',
        connectorName: 'External Wallet',
        isGasSponsored: false,
      });
    }
  }

  return wallets;
}

/**
 * Check if user has multiple wallet options (embedded + linked external)
 * Returns true if user can choose between Privy wallet and external wallet
 */
export function hasMultipleWalletOptions(user: any): boolean {
  const wallets = getLinkedWalletsFromPrivyUser(user);
  const hasEmbedded = wallets.some(w => w.type === 'embedded' || w.type === 'smart_wallet');
  const hasExternal = wallets.some(w => w.type === 'external');
  
  return hasEmbedded && hasExternal && wallets.length >= 2;
}

/**
 * Get display name for wallet connector type
 */
function getConnectorDisplayName(connectorType?: string): string {
  switch (connectorType) {
    case 'embedded':
      return 'Privy Wallet';
    case 'metamask':
      return 'MetaMask';
    case 'phantom':
      return 'Phantom';
    case 'wallet_connect':
      return 'WalletConnect';
    case 'coinbase_wallet':
      return 'Coinbase Wallet';
    case 'trust':
      return 'Trust Wallet';
    case 'rainbow':
      return 'Rainbow';
    default:
      return connectorType ? `${connectorType.charAt(0).toUpperCase()}${connectorType.slice(1)}` : 'External Wallet';
  }
}

/**
 * Get embedded/Privy wallet from user (gas sponsored)
 */
export function getPrivyWalletFromUser(user: any): {
  address: string;
  connectorName: string;
} | null {
  const wallets = getLinkedWalletsFromPrivyUser(user);
  const privyWallet = wallets.find(w => w.isGasSponsored);
  
  if (!privyWallet) return null;
  
  return {
    address: privyWallet.address,
    connectorName: privyWallet.connectorName,
  };
}

/**
 * Get external wallets from user (user pays gas)
 */
export function getExternalWalletsFromUser(user: any): Array<{
  address: string;
  connectorType?: string;
  connectorName: string;
}> {
  const wallets = getLinkedWalletsFromPrivyUser(user);
  return wallets
    .filter(w => w.type === 'external')
    .map(w => ({
      address: w.address,
      connectorType: w.connectorType,
      connectorName: w.connectorName,
    }));
}
