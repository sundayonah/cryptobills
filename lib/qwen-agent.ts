import { getEnabledCategories } from '@/lib/categories';
import { getExchangeRates } from '@/lib/exchange';
import { getPayBetaClient } from '@/lib/paybeta';
import config from '@/lib/config';
import {
  createQwenChatCompletion,
  type QwenChatMessage,
  type QwenToolDefinition,
} from '@/lib/qwen-cloud';
import type {
  AgentBillIntent,
  AgentChatMessage,
  AgentChatResponse,
  AirtimeService,
  DataBundlePackage,
  DataBundleService,
  UtilityBillCategory,
} from '@/types';

const AIRTIME_SERVICES: AirtimeService[] = ['mtn_vtu', 'glo_vtu', 'airtel_vtu', '9mobile_vtu'];
const DATA_SERVICES: DataBundleService[] = ['mtn_data', 'glo_data', 'airtel_data', '9mobile_data'];
const BILL_CATEGORIES: UtilityBillCategory[] = [
  'airtime',
  'data_bundle',
  'electricity',
  'cable_tv',
  'gaming',
];

const SERVICE_LABELS: Record<AirtimeService, string> = {
  mtn_vtu: 'MTN',
  glo_vtu: 'GLO',
  airtel_vtu: 'Airtel',
  '9mobile_vtu': '9mobile',
};

const DATA_SERVICE_LABELS: Record<DataBundleService, string> = {
  mtn_data: 'MTN',
  glo_data: 'GLO',
  airtel_data: 'Airtel',
  '9mobile_data': '9mobile',
};

const CATEGORY_API_PATH: Record<UtilityBillCategory, string> = {
  airtime: '/airtime/providers',
  data_bundle: '/data-bundle/providers',
  cable_tv: '/cable/providers',
  electricity: '/electricity/providers',
  showmax: '/showmax/bouquets',
  gaming: '/gaming/providers',
  transfer: '/transfer',
};

const SYSTEM_PROMPT = `You are Cryptobilz Assistant, an autopilot agent for paying Nigerian utility bills with USDC or USDT stablecoins.

You help users with airtime, data bundles, electricity, cable TV, and gaming/betting wallet top-ups.
Users can pay bills for any valid recipient (their own line or someone else's phone, meter, smart card, or betting account).

Rules:
- Use tools for live exchange rates, bill categories, providers, and order preparation.
- Call the matching prepare_* tool once details are clear:
  - prepare_airtime_order — phone, network, NGN amount
  - prepare_data_bundle_order — phone, network, bundle (use get_data_bundles first if user names a plan)
  - prepare_electricity_order — DISCO, meter number, prepaid/postpaid, NGN amount (min ₦1,000)
  - prepare_gaming_order — betting provider, customer ID, NGN amount
  - prepare_cable_order — provider (dstv/gotv/startimes), smart card, package (use get_cable_packages first)
- Ask the user to tap Confirm & pay in chat when an order is ready.
- Never claim a payment completed; the user must sign a wallet transaction in the app.
- Keep replies concise and friendly.
- Amounts for airtime, electricity, and gaming are in Nigerian Naira (NGN). Data and cable use fixed package prices.
- Voice transcripts may contain ASR errors: "Andre Nera" or "under naira" usually means "100 naira"; "nera" means "naira".
- If a phone number is incomplete (fewer than 11 digits), ask the user to repeat it digit by digit.`;

const TOOLS: QwenToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_exchange_rates',
      description: 'Get current USDC and USDT to NGN exchange rates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bill_categories',
      description: 'List supported utility bill categories on Cryptobilz.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_providers',
      description: 'List providers for a bill category (airtime, data_bundle, electricity, cable_tv, gaming).',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: BILL_CATEGORIES,
            description: 'Bill category',
          },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_data_bundles',
      description: 'List data bundle packages for a network (mtn_data, glo_data, airtel_data, 9mobile_data).',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: DATA_SERVICES,
            description: 'Data bundle service slug',
          },
        },
        required: ['service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cable_packages',
      description: 'List cable TV subscription packages for a provider (e.g. dstv, gotv, startimes).',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Cable provider slug from get_providers' },
        },
        required: ['service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_airtime_order',
      description:
        'Validate and summarize an airtime order. Call only when phone, NGN amount, and network are known.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', description: 'Recipient Nigerian mobile number, e.g. 08012345678' },
          amountNgn: { type: 'number', description: 'Airtime amount in Nigerian Naira (min ₦100)' },
          service: { type: 'string', enum: AIRTIME_SERVICES, description: 'Airtime service slug' },
        },
        required: ['phoneNumber', 'amountNgn', 'service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_data_bundle_order',
      description:
        'Validate and summarize a data bundle order. Use get_data_bundles to find bundleCode if needed.',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', description: 'Nigerian mobile number' },
          service: { type: 'string', enum: DATA_SERVICES, description: 'Data network slug' },
          bundleCode: { type: 'string', description: 'Bundle code from get_data_bundles' },
        },
        required: ['phoneNumber', 'service', 'bundleCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_electricity_order',
      description:
        'Validate meter and summarize an electricity purchase. Minimum ₦1,000. Validates meter via API.',
      parameters: {
        type: 'object',
        properties: {
          meterNumber: { type: 'string', description: 'Electricity meter number' },
          amountNgn: { type: 'number', description: 'Amount in NGN (min ₦1,000)' },
          service: { type: 'string', description: 'DISCO slug from get_providers, e.g. ikeja-electric' },
          meterType: {
            type: 'string',
            enum: ['prepaid', 'postpaid'],
            description: 'Meter type (default prepaid if user did not specify)',
          },
        },
        required: ['meterNumber', 'amountNgn', 'service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_gaming_order',
      description:
        'Validate betting/gaming account and summarize a wallet top-up. Validates customer ID via API.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'Betting/gaming account customer ID' },
          amountNgn: { type: 'number', description: 'Top-up amount in NGN' },
          service: { type: 'string', description: 'Gaming provider slug from get_providers' },
        },
        required: ['customerId', 'amountNgn', 'service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_cable_order',
      description:
        'Validate smart card and summarize a cable TV subscription. Use get_cable_packages for packageCode.',
      parameters: {
        type: 'object',
        properties: {
          smartCardNumber: { type: 'string', description: 'Decoder smart card / IUC number' },
          service: { type: 'string', description: 'Cable provider slug (dstv, gotv, startimes)' },
          packageCode: { type: 'string', description: 'Package code from get_cable_packages' },
        },
        required: ['smartCardNumber', 'service', 'packageCode'],
      },
    },
  },
];

function normalizePhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 10 && !digits.startsWith('0')) {
    return `0${digits}`;
  }
  return digits;
}

function isValidNigerianPhone(phone: string): boolean {
  return /^0[789][01]\d{8}$/.test(phone);
}

function inferAirtimeService(text: string): AirtimeService | null {
  const lower = text.toLowerCase();
  if (lower.includes('mtn')) return 'mtn_vtu';
  if (lower.includes('glo')) return 'glo_vtu';
  if (lower.includes('airtel')) return 'airtel_vtu';
  if (lower.includes('9mobile') || lower.includes('etisalat')) return '9mobile_vtu';
  return null;
}

function inferDataService(text: string): DataBundleService | null {
  const lower = text.toLowerCase();
  if (lower.includes('mtn')) return 'mtn_data';
  if (lower.includes('glo')) return 'glo_data';
  if (lower.includes('airtel')) return 'airtel_data';
  if (lower.includes('9mobile') || lower.includes('etisalat')) return '9mobile_data';
  return null;
}

function resolveProviderName(
  providers: Array<{ name?: string; slug?: string }>,
  service: string,
  fallback: string,
): string {
  const match = providers.find(
    (p) => p.slug === service || p.slug?.replace(/-/g, '_') === service.replace(/-/g, '_'),
  );
  return match?.name ?? fallback;
}

async function fetchCategoryProviders(category: UtilityBillCategory) {
  const paybeta = getPayBetaClient();
  const path = CATEGORY_API_PATH[category];
  const response = await paybeta.api.get(path);
  if (response.data.status === 'successful' && Array.isArray(response.data.data)) {
    return response.data.data as Array<{ name?: string; slug?: string; status?: boolean }>;
  }
  return [];
}

async function fetchDataBundlePackages(service: DataBundleService): Promise<DataBundlePackage[]> {
  const paybeta = getPayBetaClient();
  const response = await paybeta.api.post<{ status: string; data?: { packages: DataBundlePackage[] } }>(
    '/data-bundle/list',
    { service },
  );
  if (response.data.status === 'successful' && response.data.data?.packages) {
    return response.data.data.packages;
  }
  return [];
}

async function fetchCablePackages(service: string): Promise<DataBundlePackage[]> {
  const paybeta = getPayBetaClient();
  const response = await paybeta.api.post<{ status: string; data?: { packages: DataBundlePackage[] } }>(
    '/cable/bouquet',
    { service },
  );
  if (response.data.status === 'successful' && response.data.data?.packages) {
    return response.data.data.packages;
  }
  return [];
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: string; billIntent?: AgentBillIntent }> {
  switch (name) {
    case 'get_exchange_rates': {
      const rates = await getExchangeRates();
      return {
        content: JSON.stringify({
          usdcToNgn: rates.usdcToNgn,
          usdtToNgn: rates.usdtToNgn,
          timestamp: rates.timestamp,
        }),
      };
    }
    case 'list_bill_categories': {
      const categories = getEnabledCategories().map((cat) => ({
        id: cat.id,
        name: cat.name,
      }));
      return { content: JSON.stringify({ categories }) };
    }
    case 'get_providers': {
      const category = String(args.category ?? '') as UtilityBillCategory;
      if (!BILL_CATEGORIES.includes(category)) {
        return { content: JSON.stringify({ ok: false, error: 'Invalid category.' }) };
      }
      const providers = await fetchCategoryProviders(category);
      return {
        content: JSON.stringify({
          ok: true,
          category,
          providers: providers.filter((p) => p.status !== false),
        }),
      };
    }
    case 'get_data_bundles': {
      let service = String(args.service ?? '') as DataBundleService;
      if (!DATA_SERVICES.includes(service)) {
        const inferred = inferDataService(String(args.service ?? ''));
        if (inferred) service = inferred;
      }
      if (!DATA_SERVICES.includes(service)) {
        return { content: JSON.stringify({ ok: false, error: 'Invalid data service slug.' }) };
      }
      const packages = await fetchDataBundlePackages(service);
      return {
        content: JSON.stringify({
          ok: true,
          service,
          packages: packages.map((p) => ({
            code: p.code,
            description: p.description,
            priceNgn: p.price,
          })),
        }),
      };
    }
    case 'get_cable_packages': {
      const service = String(args.service ?? '').trim();
      if (!service) {
        return { content: JSON.stringify({ ok: false, error: 'Service slug is required.' }) };
      }
      const packages = await fetchCablePackages(service);
      return {
        content: JSON.stringify({
          ok: true,
          service,
          packages: packages.map((p) => ({
            code: p.code,
            description: p.description,
            priceNgn: p.price,
          })),
        }),
      };
    }
    case 'prepare_airtime_order': {
      const phoneNumber = normalizePhoneNumber(String(args.phoneNumber ?? ''));
      const amountNgn = Math.round(Number(args.amountNgn));
      let service = String(args.service ?? '') as AirtimeService;

      if (!AIRTIME_SERVICES.includes(service)) {
        const inferred = inferAirtimeService(String(args.service ?? phoneNumber));
        if (inferred) service = inferred;
      }

      if (!isValidNigerianPhone(phoneNumber)) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Invalid Nigerian phone number. Use format 080XXXXXXXX.',
          }),
        };
      }

      if (!Number.isFinite(amountNgn) || amountNgn < 100) {
        return {
          content: JSON.stringify({ ok: false, error: 'Minimum airtime amount is ₦100.' }),
        };
      }

      if (!AIRTIME_SERVICES.includes(service)) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Unknown network. Use mtn_vtu, glo_vtu, airtel_vtu, or 9mobile_vtu.',
          }),
        };
      }

      const providerName = SERVICE_LABELS[service];
      const summary = `₦${amountNgn.toLocaleString()} ${providerName} airtime for ${phoneNumber}`;
      const billIntent: AgentBillIntent = {
        category: 'airtime',
        phoneNumber,
        amountNgn,
        service,
        providerName,
        summary,
      };

      return {
        content: JSON.stringify({ ok: true, summary, nextStep: 'User taps Confirm & pay in the app.' }),
        billIntent,
      };
    }
    case 'prepare_data_bundle_order': {
      const phoneNumber = normalizePhoneNumber(String(args.phoneNumber ?? ''));
      let service = String(args.service ?? '') as DataBundleService;
      const bundleCode = String(args.bundleCode ?? '').trim();

      if (!DATA_SERVICES.includes(service)) {
        const inferred = inferDataService(String(args.service ?? ''));
        if (inferred) service = inferred;
      }

      if (!isValidNigerianPhone(phoneNumber)) {
        return { content: JSON.stringify({ ok: false, error: 'Invalid Nigerian phone number.' }) };
      }

      if (!DATA_SERVICES.includes(service) || !bundleCode) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Provide network (mtn_data, etc.) and bundleCode from get_data_bundles.',
          }),
        };
      }

      const packages = await fetchDataBundlePackages(service);
      const bundle = packages.find((p) => p.code === bundleCode);
      if (!bundle) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Bundle not found. Call get_data_bundles and use a valid bundleCode.',
          }),
        };
      }

      const amountNgn = Math.round(parseFloat(bundle.price));
      const providerName = DATA_SERVICE_LABELS[service];
      const summary = `${bundle.description} (${providerName}) for ${phoneNumber} — ₦${amountNgn.toLocaleString()}`;
      const billIntent: AgentBillIntent = {
        category: 'data_bundle',
        phoneNumber,
        service,
        bundleCode: bundle.code,
        bundleDescription: bundle.description,
        amountNgn,
        providerName,
        summary,
      };

      return {
        content: JSON.stringify({
          ok: true,
          summary,
          bundleCode: bundle.code,
          amountNgn,
          nextStep: 'User taps Confirm & pay in the app.',
        }),
        billIntent,
      };
    }
    case 'prepare_electricity_order': {
      const meterNumber = String(args.meterNumber ?? '').replace(/\s/g, '');
      const amountNgn = Math.round(Number(args.amountNgn));
      const service = String(args.service ?? '').trim();
      const meterType = (args.meterType === 'postpaid' ? 'postpaid' : 'prepaid') as 'prepaid' | 'postpaid';

      if (!meterNumber || meterNumber.length < 10) {
        return { content: JSON.stringify({ ok: false, error: 'Invalid meter number.' }) };
      }

      if (!Number.isFinite(amountNgn) || amountNgn < 1000) {
        return { content: JSON.stringify({ ok: false, error: 'Minimum electricity amount is ₦1,000.' }) };
      }

      if (!service) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'DISCO service slug is required. Use get_providers with category electricity.',
          }),
        };
      }

      const paybeta = getPayBetaClient();
      let validation;
      try {
        const response = await paybeta.api.post('/electricity/validate', {
          service,
          meterNumber,
          meterType,
        });
        if (response.data.status !== 'successful' || !response.data.data) {
          return {
            content: JSON.stringify({
              ok: false,
              error: response.data.message || 'Meter validation failed.',
            }),
          };
        }
        validation = response.data.data;
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        return {
          content: JSON.stringify({
            ok: false,
            error: err.response?.data?.message || err.message || 'Meter validation failed.',
          }),
        };
      }

      const providers = await fetchCategoryProviders('electricity');
      const providerName = resolveProviderName(providers, service, service);
      const summary = `₦${amountNgn.toLocaleString()} ${providerName} (${meterType}) for meter ${meterNumber} — ${validation.customerName}`;
      const billIntent: AgentBillIntent = {
        category: 'electricity',
        meterNumber,
        meterType,
        amountNgn,
        service,
        providerName,
        customerName: validation.customerName,
        customerAddress: validation.customerAddress,
        summary,
      };

      return {
        content: JSON.stringify({
          ok: true,
          summary,
          customerName: validation.customerName,
          nextStep: 'User taps Confirm & pay in the app.',
        }),
        billIntent,
      };
    }
    case 'prepare_gaming_order': {
      const customerId = String(args.customerId ?? '').trim();
      const amountNgn = Math.round(Number(args.amountNgn));
      const service = String(args.service ?? '').trim();

      if (!customerId) {
        return { content: JSON.stringify({ ok: false, error: 'Customer ID is required.' }) };
      }

      if (!service) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Gaming provider slug is required. Use get_providers with category gaming.',
          }),
        };
      }

      const paybeta = getPayBetaClient();
      let validation;
      try {
        const response = await paybeta.api.post('/gaming/validate', { service, customerId });
        if (response.data.status !== 'successful' || !response.data.data) {
          return {
            content: JSON.stringify({
              ok: false,
              error: response.data.message || 'Account validation failed.',
            }),
          };
        }
        validation = response.data.data;
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        return {
          content: JSON.stringify({
            ok: false,
            error: err.response?.data?.message || err.message || 'Account validation failed.',
          }),
        };
      }

      const minimumAmount = Number(validation.minimumAmount) || 100;
      if (!Number.isFinite(amountNgn) || amountNgn < minimumAmount) {
        return {
          content: JSON.stringify({
            ok: false,
            error: `Minimum top-up for this provider is ₦${minimumAmount.toLocaleString()}.`,
          }),
        };
      }

      const providers = await fetchCategoryProviders('gaming');
      const providerName = resolveProviderName(providers, service, service);
      const customerName =
        typeof validation.customerName === 'string' ? validation.customerName.trim() : '';
      const summary = `₦${amountNgn.toLocaleString()} ${providerName} top-up for account ${customerId}`;
      const billIntent: AgentBillIntent = {
        category: 'gaming',
        customerId,
        amountNgn,
        service,
        providerName,
        customerName: customerName || customerId,
        minimumAmount,
        summary,
      };

      return {
        content: JSON.stringify({
          ok: true,
          summary,
          minimumAmount,
          nextStep: 'User taps Confirm & pay in the app.',
        }),
        billIntent,
      };
    }
    case 'prepare_cable_order': {
      const smartCardNumber = String(args.smartCardNumber ?? '').replace(/\s/g, '');
      const service = String(args.service ?? '').trim();
      const packageCode = String(args.packageCode ?? '').trim();

      if (!smartCardNumber) {
        return { content: JSON.stringify({ ok: false, error: 'Smart card number is required.' }) };
      }

      if (!service || !packageCode) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Provider and packageCode are required. Use get_cable_packages first.',
          }),
        };
      }

      const paybeta = getPayBetaClient();
      let validation;
      try {
        const response = await paybeta.api.post('/cable/validate', { service, smartCardNumber });
        if (response.data.status !== 'successful' || !response.data.data) {
          return {
            content: JSON.stringify({
              ok: false,
              error: response.data.message || 'Smart card validation failed.',
            }),
          };
        }
        validation = response.data.data;
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        return {
          content: JSON.stringify({
            ok: false,
            error: err.response?.data?.message || err.message || 'Smart card validation failed.',
          }),
        };
      }

      const packages = await fetchCablePackages(service);
      const pkg = packages.find((p) => p.code === packageCode);
      if (!pkg) {
        return {
          content: JSON.stringify({
            ok: false,
            error: 'Package not found. Call get_cable_packages and use a valid packageCode.',
          }),
        };
      }

      const amountNgn = Math.round(parseFloat(pkg.price));
      const providers = await fetchCategoryProviders('cable_tv');
      const providerName = resolveProviderName(providers, service, service.toUpperCase());
      const summary = `${pkg.description} (${providerName}) for card ${smartCardNumber} — ₦${amountNgn.toLocaleString()}`;
      const billIntent: AgentBillIntent = {
        category: 'cable_tv',
        smartCardNumber,
        service,
        packageCode: pkg.code,
        packageDescription: pkg.description,
        amountNgn,
        providerName,
        customerName: validation.customerName || '',
        summary,
      };

      return {
        content: JSON.stringify({
          ok: true,
          summary,
          customerName: validation.customerName,
          nextStep: 'User taps Confirm & pay in the app.',
        }),
        billIntent,
      };
    }
    default:
      return { content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }
}

function toQwenMessages(messages: AgentChatMessage[]): QwenChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
  ];
}

export async function runQwenAgent(messages: AgentChatMessage[]): Promise<AgentChatResponse> {
  const qwenMessages = toQwenMessages(messages);
  let billIntent: AgentBillIntent | undefined;
  const maxRounds = 8;

  for (let round = 0; round < maxRounds; round += 1) {
    const completion = await createQwenChatCompletion({
      messages: qwenMessages,
      tools: TOOLS,
    });

    const choice = completion.choices[0];
    if (!choice?.message) {
      throw new Error('Empty response from Qwen');
    }

    const assistantMessage = choice.message;
    qwenMessages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        message: assistantMessage.content?.trim() || 'How can I help you pay a bill today?',
        billIntent,
      };
    }

    for (const toolCall of toolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }

      const result = await executeTool(toolCall.function.name, parsedArgs);
      if (result.billIntent) {
        billIntent = result.billIntent;
      }

      qwenMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: result.content,
      });
    }
  }

  return {
    message: 'I need a bit more detail. Which bill type, account or meter number, and amount in NGN?',
    billIntent,
  };
}
