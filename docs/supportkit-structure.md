# SupportKit Dashboard - Modern & Professional File Structure

```
supportkit-dashboard/
│
├── .github/
│   └── workflows/
│       ├── ci.yml                          # Continuous Integration
│       └── deploy.yml                      # Deployment automation
│
├── prisma/
│   ├── migrations/                         # Database migrations
│   ├── schema.prisma                       # Database schema
│   └── seed.ts                            # Seed data for development
│
├── public/
│   ├── icons/
│   │   ├── favicon.ico
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   ├── images/
│   │   ├── logo.svg
│   │   ├── logo-dark.svg
│   │   └── placeholder.svg
│   └── fonts/                             # Custom fonts (if needed)
│
├── src/
│   │
│   ├── app/                               # Next.js 14 App Router
│   │   │
│   │   ├── (auth)/                        # Auth route group (no layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # Login page
│   │   │   ├── register/
│   │   │   │   └── page.tsx              # Registration page
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx              # Password reset
│   │   │   └── verify-email/
│   │   │       └── page.tsx              # Email verification
│   │   │
│   │   ├── (dashboard)/                   # Dashboard route group (with sidebar)
│   │   │   ├── layout.tsx                # Dashboard layout (sidebar, header)
│   │   │   │
│   │   │   ├── overview/                 # Dashboard home
│   │   │   │   └── page.tsx              # Overview/stats page
│   │   │   │
│   │   │   ├── projects/                 # Projects management
│   │   │   │   ├── page.tsx              # Projects list
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── page.tsx          # Single project view
│   │   │   │   │   ├── settings/
│   │   │   │   │   │   └── page.tsx      # Project settings
│   │   │   │   │   └── api-keys/
│   │   │   │   │       └── page.tsx      # API key management
│   │   │   │   └── new/
│   │   │   │       └── page.tsx          # Create new project
│   │   │   │
│   │   │   ├── messages/                 # Messages inbox
│   │   │   │   ├── page.tsx              # Messages list (all projects)
│   │   │   │   ├── [conversationId]/
│   │   │   │   │   └── page.tsx          # Single conversation thread
│   │   │   │   └── components/
│   │   │   │       ├── message-list.tsx
│   │   │   │       ├── message-item.tsx
│   │   │   │       ├── conversation-sidebar.tsx
│   │   │   │       └── reply-form.tsx
│   │   │   │
│   │   │   ├── analytics/                # Analytics (future)
│   │   │   │   └── page.tsx
│   │   │   │
│   │   │   ├── settings/                 # Account settings
│   │   │   │   ├── page.tsx              # General settings
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx          # Profile settings
│   │   │   │   ├── billing/
│   │   │   │   │   └── page.tsx          # Billing & subscription
│   │   │   │   ├── team/                 # Team management (future)
│   │   │   │   │   └── page.tsx
│   │   │   │   └── api/
│   │   │   │       └── page.tsx          # API settings
│   │   │   │
│   │   │   └── documentation/            # SDK docs & integration guide
│   │   │       ├── page.tsx              # Docs home
│   │   │       ├── installation/
│   │   │       │   └── page.tsx          # Installation guide
│   │   │       ├── configuration/
│   │   │       │   └── page.tsx          # SDK configuration
│   │   │       └── examples/
│   │   │           └── page.tsx          # Code examples
│   │   │
│   │   ├── (marketing)/                   # Marketing pages (public)
│   │   │   ├── layout.tsx                # Marketing layout (navbar, footer)
│   │   │   ├── page.tsx                  # Homepage
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx              # Pricing page
│   │   │   ├── features/
│   │   │   │   └── page.tsx              # Features page
│   │   │   ├── docs/
│   │   │   │   └── page.tsx              # Public documentation
│   │   │   └── about/
│   │   │       └── page.tsx              # About page
│   │   │
│   │   ├── api/                           # API Routes
│   │   │   │
│   │   │   ├── auth/                      # Authentication endpoints
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts          # NextAuth.js handler
│   │   │   │
│   │   │   ├── projects/                  # Project endpoints
│   │   │   │   ├── route.ts              # GET, POST projects
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts          # GET, PATCH, DELETE project
│   │   │   │       └── api-keys/
│   │   │   │           └── route.ts      # Generate/revoke API keys
│   │   │   │
│   │   │   ├── messages/                  # Message endpoints
│   │   │   │   ├── route.ts              # GET messages
│   │   │   │   ├── [id]/
│   │   │   │   │   └── route.ts          # GET, PATCH message
│   │   │   │   └── send/
│   │   │   │       └── route.ts          # POST send message
│   │   │   │
│   │   │   ├── conversations/             # Conversation endpoints
│   │   │   │   ├── route.ts              # GET conversations
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts          # GET conversation
│   │   │   │       └── messages/
│   │   │   │           └── route.ts      # GET conversation messages
│   │   │   │
│   │   │   ├── webhooks/                  # Webhook handlers
│   │   │   │   ├── stripe/
│   │   │   │   │   └── route.ts          # Stripe webhook
│   │   │   │   └── sdk/
│   │   │   │       └── route.ts          # SDK incoming messages
│   │   │   │
│   │   │   ├── billing/                   # Billing endpoints
│   │   │   │   ├── create-checkout/
│   │   │   │   │   └── route.ts          # Create Stripe checkout
│   │   │   │   ├── portal/
│   │   │   │   │   └── route.ts          # Customer portal
│   │   │   │   └── subscription/
│   │   │   │       └── route.ts          # Subscription info
│   │   │   │
│   │   │   └── socket/                    # Socket.io initialization
│   │   │       └── route.ts              # WebSocket handler
│   │   │
│   │   ├── layout.tsx                     # Root layout
│   │   ├── globals.css                    # Global styles
│   │   ├── error.tsx                      # Error boundary
│   │   ├── loading.tsx                    # Loading UI
│   │   └── not-found.tsx                  # 404 page
│   │
│   ├── components/                        # Reusable components
│   │   │
│   │   ├── ui/                           # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── skeleton.tsx
│   │   │   └── ...                       # Other shadcn components
│   │   │
│   │   ├── dashboard/                    # Dashboard-specific components
│   │   │   ├── sidebar.tsx              # Main sidebar navigation
│   │   │   ├── header.tsx               # Dashboard header
│   │   │   ├── user-nav.tsx             # User dropdown menu
│   │   │   ├── project-switcher.tsx     # Switch between projects
│   │   │   ├── stats-card.tsx           # Statistics card
│   │   │   ├── recent-messages.tsx      # Recent messages widget
│   │   │   ├── quick-actions.tsx        # Quick action buttons
│   │   │   └── empty-state.tsx          # Empty state component
│   │   │
│   │   ├── messages/                     # Message components
│   │   │   ├── conversation-list.tsx    # List of conversations
│   │   │   ├── message-thread.tsx       # Message thread view
│   │   │   ├── message-bubble.tsx       # Single message bubble
│   │   │   ├── typing-indicator.tsx     # "User is typing..."
│   │   │   └── file-attachment.tsx      # File preview/upload
│   │   │
│   │   ├── projects/                     # Project components
│   │   │   ├── project-card.tsx         # Project card
│   │   │   ├── create-project-dialog.tsx
│   │   │   ├── api-key-display.tsx      # API key with copy button
│   │   │   └── project-stats.tsx        # Project statistics
│   │   │
│   │   ├── billing/                      # Billing components
│   │   │   ├── pricing-card.tsx         # Pricing plan card
│   │   │   ├── subscription-badge.tsx   # Current plan badge
│   │   │   └── usage-meter.tsx          # Usage progress bar
│   │   │
│   │   ├── auth/                         # Auth components
│   │   │   ├── auth-form.tsx            # Login/Register form
│   │   │   ├── oauth-buttons.tsx        # Google OAuth button
│   │   │   └── protected-route.tsx      # Route protection wrapper
│   │   │
│   │   ├── marketing/                    # Marketing components
│   │   │   ├── navbar.tsx               # Marketing navbar
│   │   │   ├── footer.tsx               # Footer
│   │   │   ├── hero.tsx                 # Hero section
│   │   │   ├── features-grid.tsx        # Features showcase
│   │   │   └── cta-section.tsx          # Call to action
│   │   │
│   │   ├── layout/                       # Layout components
│   │   │   ├── container.tsx            # Responsive container
│   │   │   ├── section.tsx              # Page section wrapper
│   │   │   └── page-header.tsx          # Page header with breadcrumbs
│   │   │
│   │   └── providers/                    # Context providers
│   │       ├── theme-provider.tsx       # Dark mode provider
│   │       ├── toast-provider.tsx       # Toast notifications
│   │       └── socket-provider.tsx      # WebSocket provider
│   │
│   ├── lib/                              # Utility libraries
│   │   ├── prisma.ts                    # Prisma client singleton
│   │   ├── auth.ts                      # Auth utilities
│   │   ├── stripe.ts                    # Stripe client
│   │   ├── socket.ts                    # Socket.io setup
│   │   ├── email.ts                     # Email sending (Resend/SendGrid)
│   │   ├── utils.ts                     # General utilities (cn, etc.)
│   │   ├── validations.ts               # Zod schemas
│   │   └── api-key.ts                   # API key generation/validation
│   │
│   ├── hooks/                            # Custom React hooks
│   │   ├── use-toast.ts                 # Toast notifications hook
│   │   ├── use-socket.ts                # WebSocket hook
│   │   ├── use-current-user.ts          # Get current user
│   │   ├── use-subscription.ts          # Get subscription status
│   │   ├── use-projects.ts              # Fetch projects
│   │   ├── use-messages.ts              # Fetch messages
│   │   ├── use-conversations.ts         # Fetch conversations
│   │   ├── use-media-query.ts           # Responsive breakpoints
│   │   └── use-debounce.ts              # Debounce hook
│   │
│   ├── stores/                           # Zustand stores
│   │   ├── use-user-store.ts            # User state
│   │   ├── use-project-store.ts         # Current project
│   │   ├── use-message-store.ts         # Messages state
│   │   ├── use-ui-store.ts              # UI state (sidebar, etc.)
│   │   └── use-notification-store.ts    # Notifications
│   │
│   ├── types/                            # TypeScript types
│   │   ├── index.ts                     # Main types export
│   │   ├── auth.ts                      # Auth types
│   │   ├── project.ts                   # Project types
│   │   ├── message.ts                   # Message types
│   │   ├── subscription.ts              # Subscription types
│   │   └── api.ts                       # API response types
│   │
│   ├── config/                           # Configuration files
│   │   ├── site.ts                      # Site metadata
│   │   ├── plans.ts                     # Subscription plans config
│   │   ├── navigation.ts                # Navigation links
│   │   └── constants.ts                 # App constants
│   │
│   └── actions/                          # Server actions (if using)
│       ├── auth.ts                      # Auth server actions
│       ├── projects.ts                  # Project server actions
│       ├── messages.ts                  # Message server actions
│       └── billing.ts                   # Billing server actions
│
├── tests/                                # Tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example                          # Environment variables template
├── .env.local                            # Local environment variables (gitignored)
├── .eslintrc.json                        # ESLint configuration
├── .prettierrc                           # Prettier configuration
├── .gitignore                            # Git ignore rules
├── components.json                       # shadcn/ui config
├── next.config.mjs                       # Next.js configuration
├── package.json                          # Dependencies
├── pnpm-lock.yaml                        # pnpm lock file
├── postcss.config.js                     # PostCSS config
├── tailwind.config.ts                    # Tailwind configuration
├── tsconfig.json                         # TypeScript configuration
└── README.md                             # Project documentation
```

---

## Key Configuration Files Details

### `package.json`
```json
{
  "name": "supportkit-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
    "type-check": "tsc --noEmit",
    "format": "prettier --write ."
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    
    "@prisma/client": "^5.20.0",
    "@next-auth/prisma-adapter": "^1.0.7",
    "next-auth": "^4.24.0",
    
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    
    "zustand": "^4.5.0",
    "zod": "^3.23.0",
    "framer-motion": "^11.0.0",
    
    "stripe": "^16.0.0",
    "@stripe/stripe-js": "^4.0.0",
    
    "socket.io": "^4.7.0",
    "socket.io-client": "^4.7.0",
    
    "resend": "^3.0.0",
    "react-email": "^2.0.0",
    
    "lucide-react": "^0.400.0",
    "date-fns": "^3.0.0",
    "nanoid": "^5.0.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/bcryptjs": "^2.4.6",
    
    "prisma": "^5.20.0",
    "tsx": "^4.0.0",
    
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "prettier": "^3.2.0",
    "prettier-plugin-tailwindcss": "^0.5.0"
  }
}
```

---

### `.env.example`
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/supportkit?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here-generate-with-openssl"

# OAuth Providers
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_FREE="price_..."
STRIPE_PRICE_ID_PRO="price_..."
STRIPE_PRICE_ID_MAX="price_..."

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@supportkit.dev"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"

# WebSocket (if separate server)
SOCKET_SERVER_URL="http://localhost:3001"
```

---

### `prisma/schema.prisma` (Initial Schema)
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// User & Authentication
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // For email/password auth
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts      Account[]
  sessions      Session[]
  projects      Project[]
  subscription  Subscription?
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// Subscription & Billing
model Subscription {
  id                   String    @id @default(cuid())
  userId               String    @unique
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  stripePriceId        String?
  stripeCurrentPeriodEnd DateTime?
  plan                 Plan      @default(FREE)
  status               SubscriptionStatus @default(ACTIVE)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum Plan {
  FREE
  PRO
  MAX
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  INCOMPLETE
  TRIALING
}

// Projects & API Keys
model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  userId      String
  apiKey      String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversations Conversation[]
  messages      Message[]

  @@index([userId])
  @@index([apiKey])
}

// Conversations & Messages
model Conversation {
  id          String   @id @default(cuid())
  projectId   String
  userId      String   // End user ID (from client website)
  userName    String?
  userEmail   String?
  metadata    Json?    // Additional user info
  status      ConversationStatus @default(OPEN)
  lastMessageAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([projectId])
  @@index([userId])
  @@index([status])
}

enum ConversationStatus {
  OPEN
  CLOSED
  RESOLVED
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  projectId      String
  content        String   @db.Text
  senderType     SenderType
  senderId       String?  // User ID or support agent ID
  attachments    Json?    // Array of file URLs
  metadata       Json?
  readAt         DateTime?
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([projectId])
  @@index([createdAt])
}

enum SenderType {
  CUSTOMER
  SUPPORT
  SYSTEM
}
```

---

### `tailwind.config.ts`
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-from-top": {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-in",
        "slide-in": "slide-in-from-top 0.3s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

---

### `src/config/plans.ts`
```typescript
export const PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    priceId: process.env.STRIPE_PRICE_ID_FREE,
    maxProjects: 1,
    features: [
      "1 project",
      "Unlimited messages",
      "Basic analytics",
      "Email support",
    ],
  },
  PRO: {
    name: "Pro",
    price: 10,
    priceId: process.env.STRIPE_PRICE_ID_PRO,
    maxProjects: 3,
    features: [
      "3 projects",
      "Unlimited messages",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
  },
  MAX: {
    name: "Max",
    price: 25,
    priceId: process.env.STRIPE_PRICE_ID_MAX,
    maxProjects: 5,
    features: [
      "5 projects",
      "Unlimited messages",
      "Advanced analytics",
      "24/7 support",
      "Custom branding",
      "Team collaboration",
      "API access",
    ],
  },
} as const;

export type PlanType = keyof typeof PLANS;
```

---

## Design System Notes

### Color Scheme (Modern SaaS)
- **Primary**: Indigo/Blue (#6366F1) - Trust, professional
- **Accent**: Violet (#8B5CF6) - Modern, premium
- **Success**: Green (#10B981)
- **Warning**: Amber (#F59E0B)
- **Error**: Red (#EF4444)
- **Background**: Slate gray for dark mode, white for light

### Typography
- **Headings**: Inter or Geist (modern, clean)
- **Body**: System font stack for performance
- **Code**: Fira Code or JetBrains Mono

### Spacing System
- Based on 4px scale (4, 8, 12, 16, 24, 32, 48, 64)
- Consistent padding/margins throughout

### Component Library (shadcn/ui)
All components follow Radix UI primitives for accessibility

---

## Key Features of This Structure

### ✅ Scalability
- Route groups for logical organization
- Separation of concerns (components, hooks, stores)
- Easy to add new features

### ✅ Type Safety
- Full TypeScript coverage
- Zod validation schemas
- Prisma type generation

### ✅ Developer Experience
- Clear folder structure
- Consistent naming conventions
- Easy to navigate

### ✅ Modern Best Practices
- App Router (Next.js 14)
- Server Components by default
- Server Actions for mutations
- Edge-ready API routes

### ✅ Performance
- Optimized imports
- Code splitting
- Image optimization
- Font optimization

### ✅ Security
- NextAuth.js for auth
- CSRF protection
- Rate limiting ready
- Secure API key storage

---

## Next Steps

Ready to start building? I can:

1. **Generate the complete project** with all files configured
2. **Start with authentication** (NextAuth + Google OAuth)
3. **Set up the database** (Prisma schema + migrations)
4. **Create the dashboard layout** (Sidebar, header, navigation)
5. **Build the messaging system** (WebSocket + UI)

Which would you like to tackle first?