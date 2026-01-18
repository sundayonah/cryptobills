# CryptoBills

A Web3 platform for purchasing Nigerian airtime using USDC or USDT tokens. Built with Next.js, Privy, and PayBeta API.

## Features

-  🔐 Web3 wallet connection (MetaMask, Trust Wallet, etc.) via Privy
-  💰 Support for USDC and USDT payments
-  📱 Airtime top-up for all major Nigerian networks (MTN, GLO, Airtel, 9mobile)
-  📦 Data bundle purchases for all networks
-  📺 Cable TV subscriptions (DStv, GOtv, StarTimes)
-  ⚡ Electricity bill payments
-  💱 Real-time USDC/USDT to NGN conversion
-  📊 Transaction history tracking
-  🎨 Modern UI with Framer Motion animations

## Tech Stack

-  **Framework**: Next.js 14 (App Router)
-  **Language**: TypeScript
-  **Styling**: Tailwind CSS
-  **UI Components**: Shadcn UI
-  **Animations**: Framer Motion
-  **Web3**: Privy
-  **Database**: PostgreSQL (via Supabase)
-  **ORM**: Prisma
-  **Validation**: Zod
-  **Package Manager**: pnpm

## Getting Started

### Prerequisites

-  Node.js 18+ and pnpm
-  PostgreSQL database (Supabase recommended)
-  Privy account and App ID
-  PayBeta account and API key

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd cryptobills
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Fill in your environment variables:

-  `NEXT_PUBLIC_PRIVY_APP_ID`: Get from [Privy Dashboard](https://dashboard.privy.io)
-  `PAYBETA_API_KEY`: Get from [PayBeta Console](https://console.paybeta.ng)
-  `DATABASE_URL`: Your Supabase PostgreSQL connection string
-  `NEXT_PUBLIC_USDC_ADDRESS`: USDC contract address for your network
-  `NEXT_PUBLIC_USDT_ADDRESS`: USDT contract address for your network
-  `NEXT_PUBLIC_PAYMENT_RECIPIENT_ADDRESS`: Your wallet address to receive payments

4. Set up the database:

```bash
pnpm db:generate
pnpm db:push
```

5. Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
cryptobills/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── airtime/       # Airtime purchase endpoints
│   │   ├── exchange-rate/ # Exchange rate endpoint
│   │   └── transactions/  # Transaction history
│   ├── layout.tsx         # Root layout with Privy provider
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # Shadcn UI components
│   ├── wallet-connect.tsx # Wallet connection component
│   └── airtime-form.tsx   # Airtime purchase form
├── lib/                   # Utility libraries
│   ├── paybeta.ts        # PayBeta API client
│   ├── exchange.ts        # Exchange rate utilities
│   ├── constants.ts       # App constants
│   ├── prisma.ts          # Prisma client
│   └── utils.ts           # Utility functions
├── types/                 # TypeScript types
│   ├── paybeta.ts         # PayBeta API types
│   ├── wallet.ts          # Wallet types
│   ├── transaction.ts     # Transaction types
│   └── index.ts           # Type exports
├── prisma/                # Prisma schema
│   └── schema.prisma      # Database schema
└── hooks/                 # React hooks
    └── use-toast.ts       # Toast notification hook
```

## API Endpoints

### POST /api/airtime/purchase

Purchase airtime using crypto payment.

**Request Body:**

```json
{
   "walletAddress": "0x...",
   "privyUserId": "user_id",
   "token": "USDC",
   "tokenAmount": "1.0",
   "phoneNumber": "08123456789",
   "service": "mtn_vtu",
   "paymentTxHash": "0x..."
}
```

### GET /api/airtime/providers

Get available airtime providers.

### GET /api/exchange-rate

Get current USDC/USDT to NGN exchange rates.

### GET /api/transactions?walletAddress=0x...

Get transaction history for a wallet address.

## Environment Variables

See `.env.example` for all required environment variables.

## Database Schema

The application uses Prisma with PostgreSQL. Key models:

-  **User**: Stores wallet addresses and Privy user IDs
-  **Transaction**: Tracks all airtime purchases with payment and PayBeta transaction details

## Exchange Rate

The app uses [PayCrest API](https://api.paycrest.io) for real-time USDC/USDT to NGN exchange rates. The rates are automatically fetched from:

-  `https://api.paycrest.io/v1/rates/usdt/100/ngn` for USDT
-  `https://api.paycrest.io/v1/rates/usdc/100/ngn` for USDC

If the API fails, a fallback rate of 1500 NGN per USD is used.

## Security Notes

-  Always verify payment transactions on-chain before processing airtime purchases
-  Store API keys securely and never commit them to version control
-  Implement rate limiting for API endpoints
-  Add proper error handling and logging in production

## License

MIT
