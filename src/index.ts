interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * People Data Labs MCP — wraps the PDL person/company enrichment API
 * (peopledatalabs.com).
 *
 * Tools:
 * - pdl_person_enrich: enrich a person from email / LinkedIn / name+company / phone
 * - pdl_company_enrich: enrich a company from its name or domain
 *
 * COMPLIANCE: PDL returns regulated personal data. This pack is a pure
 * passthrough — it does NO caching of any kind. Every call hits the upstream
 * API live under the caller's own key.
 *
 * BYO key: every tool requires `_apiKey` (the caller's PDL key), passed as the
 * `X-Api-Key` header. There is no shared/platform key for this pack.
 *
 * A 404 from PDL means "no match found" — PDL does not charge for it — so we
 * return { found: false } rather than throwing.
 */


const BASE_URL = 'https://api.peopledatalabs.com/v5';

const tools: McpToolExport['tools'] = [
  {
    name: 'pdl_person_enrich',
    description:
      'Enrich a person from their email / LinkedIn / name+company / phone using People Data Labs. Returns job title, company, emails, phone numbers, location, and skills. Provide at least one identifier. Example: pdl_person_enrich({ email: "sean@peopledatalabs.com", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'Email address of the person, e.g. "sean@peopledatalabs.com"',
        },
        phone: {
          type: 'string',
          description: 'Phone number of the person, e.g. "+14155551234"',
        },
        profile: {
          type: 'string',
          description: 'LinkedIn profile URL, e.g. "https://www.linkedin.com/in/seanthorne"',
        },
        name: {
          type: 'string',
          description: 'Full name of the person, e.g. "Sean Thorne" (best combined with `company`)',
        },
        company: {
          type: 'string',
          description: 'Company name or domain the person works at, e.g. "People Data Labs" or "peopledatalabs.com"',
        },
        min_likelihood: {
          type: 'number',
          description: 'Minimum match likelihood, integer 1-10. PDL only returns a person if confidence meets this floor.',
        },
        _apiKey: {
          type: 'string',
          description: 'Your People Data Labs API key (peopledatalabs.com; free tier ~100/mo).',
        },
      },
      required: ['_apiKey'],
    },
  },
  {
    name: 'pdl_company_enrich',
    description:
      'Enrich a company from its name or domain using People Data Labs. Returns size, employee count, industry, founding year, location, LinkedIn, and website. Provide a name and/or website. Example: pdl_company_enrich({ website: "peopledatalabs.com", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Company name, e.g. "People Data Labs"',
        },
        website: {
          type: 'string',
          description: 'Company website or domain, e.g. "peopledatalabs.com"',
        },
        _apiKey: {
          type: 'string',
          description: 'Your People Data Labs API key (peopledatalabs.com; free tier ~100/mo).',
        },
      },
      required: ['_apiKey'],
    },
  },
];

// Shared GET helper. PDL is auth-by-header (X-Api-Key). A 404 is a *successful*
// "no match" (PDL doesn't charge) — the caller handles it as { found: false };
// every other non-2xx throws an actionable error.
async function pdlGet(
  path: string,
  params: Record<string, string | number | undefined>,
  apiKey: string,
  tool: string,
): Promise<Record<string, unknown> | null> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }

  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { 'X-Api-Key': apiKey },
  });

  // 404 = no record matched. PDL does not bill for this; return null so the
  // caller can surface { found: false } instead of an error.
  if (res.status === 404) return null;

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        `People Data Labs ${tool}: auth failed (HTTP 401) — check your PDL _apiKey (peopledatalabs.com).`,
      );
    }
    if (res.status === 402) {
      throw new Error(
        `People Data Labs ${tool}: PDL out of credits (HTTP 402). Your PDL plan's quota is exhausted — top up at peopledatalabs.com.`,
      );
    }
    if (res.status === 429) {
      throw new Error(
        `People Data Labs ${tool}: PDL rate limited (HTTP 429). Slow down or upgrade your PDL plan.`,
      );
    }
    const text = await res.text().catch(() => '');
    throw new Error(`People Data Labs ${tool} error: HTTP ${res.status}${text ? ` — ${text}` : ''}`);
  }

  return (await res.json()) as Record<string, unknown>;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string | undefined;
  delete args._apiKey;

  if (!apiKey) {
    throw new Error(
      'People Data Labs: pass your PDL api key via _apiKey (get one at peopledatalabs.com; free tier ~100/mo).',
    );
  }

  switch (name) {
    case 'pdl_person_enrich':
      return personEnrich(args, apiKey);
    case 'pdl_company_enrich':
      return companyEnrich(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface PersonData {
  full_name?: string;
  job_title?: string;
  job_company_name?: string;
  emails?: Array<{ address?: string }>;
  phone_numbers?: unknown;
  linkedin_url?: string;
  location_name?: string;
  skills?: unknown;
}

async function personEnrich(args: Record<string, unknown>, apiKey: string) {
  const email = args.email as string | undefined;
  const phone = args.phone as string | undefined;
  const profile = args.profile as string | undefined;
  const nameArg = args.name as string | undefined;
  const company = args.company as string | undefined;
  const minLikelihood = args.min_likelihood as number | undefined;

  if (!email && !phone && !profile && !nameArg) {
    throw new Error(
      'People Data Labs pdl_person_enrich: provide at least one of email/profile/name+company/phone.',
    );
  }

  const json = await pdlGet(
    '/person/enrich',
    {
      email,
      phone,
      profile,
      name: nameArg,
      company,
      min_likelihood: minLikelihood,
    },
    apiKey,
    'pdl_person_enrich',
  );

  if (json === null) return { found: false };

  // PDL person enrich nests the record under `data`.
  const data = (json.data as PersonData | undefined) ?? {};

  return {
    found: true,
    likelihood: json.likelihood,
    full_name: data.full_name,
    job_title: data.job_title,
    company: data.job_company_name,
    emails: Array.isArray(data.emails)
      ? data.emails.map((e) => ({ address: e?.address }))
      : undefined,
    phones: data.phone_numbers,
    linkedin: data.linkedin_url,
    location: data.location_name,
    skills: data.skills,
  };
}

interface CompanyData {
  name?: string;
  size?: string;
  employee_count?: number;
  industry?: string;
  founded?: number | string;
  location?: { name?: string };
  linkedin_url?: string;
  website?: string;
}

async function companyEnrich(args: Record<string, unknown>, apiKey: string) {
  const name = args.name as string | undefined;
  const website = args.website as string | undefined;

  if (!name && !website) {
    throw new Error(
      'People Data Labs pdl_company_enrich: provide at least one of name or website.',
    );
  }

  const json = await pdlGet(
    '/company/enrich',
    { name, website },
    apiKey,
    'pdl_company_enrich',
  );

  if (json === null) return { found: false };

  // PDL company enrich returns fields at the top level of the response (not
  // under `data`). Prefer top-level, but fall back to a `data` wrapper in case
  // the response shape ever nests it.
  const nested = (json.data as CompanyData | undefined) ?? {};
  const top = json as CompanyData;

  const size = top.size ?? nested.size;
  const employeeCount = top.employee_count ?? nested.employee_count;
  const industry = top.industry ?? nested.industry;
  const founded = top.founded ?? nested.founded;
  const location = top.location ?? nested.location;
  const linkedin = top.linkedin_url ?? nested.linkedin_url;
  const site = top.website ?? nested.website;
  const companyName = top.name ?? nested.name;

  return {
    found: true,
    name: companyName,
    size,
    employee_count: employeeCount,
    industry,
    founded,
    location: location?.name,
    linkedin,
    website: site,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
