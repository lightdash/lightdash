import {
    EXTERNAL_CONNECTION_METHODS,
    ParameterError,
    UnexpectedServerError,
    type ExternalConnectionConfigProposal,
    type ExternalConnectionMethod,
} from '@lightdash/common';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import Logger from '../../../../logging/logger';
import {
    validateExternalConnectionConfig,
    type ValidatableExternalConnectionConfig,
} from '../../ExternalConnectionService/externalConnectionConfigValidation';
import { GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const PROPOSAL_TIMEOUT_MS = 30_000;
const MAX_PATH_PREFIXES = 20;
const MAX_CUSTOM_HEADERS = 20;
const MAX_OAUTH_SCOPES = 10;

// The wizard hides content types and always creates JSON connections; the
// proposal validates against the same default so what the user saves is what
// was checked here.
const PROPOSAL_ALLOWED_CONTENT_TYPES = ['application/json'];

const NOT_CONFIDENT_MESSAGE =
    'Couldn\'t identify which API to connect to. Try naming the provider explicitly, e.g. "the Google Sheets API".';

// No `.max()` on arrays (Anthropic structured output rejects maxItems) and no
// z.record (it emits additionalProperties) — caps live in the prompt and are
// enforced in normalizeProposal; headers travel as name/value pairs.
const ProposalSchema = z.object({
    confident: z
        .boolean()
        .describe(
            'False when no specific API service could be identified from the description',
        ),
    name: z
        .string()
        .describe('Short human-readable connection name, e.g. "Google Sheets"'),
    origin: z
        .string()
        .nullable()
        .describe(
            'Official https base URL of the API host with no path, e.g. https://sheets.googleapis.com. Null when not confident.',
        ),
    type: z
        .enum(['none', 'api_key', 'bearer_token', 'google_service_account'])
        .describe('How the API authenticates requests'),
    apiKeyName: z
        .string()
        .nullable()
        .describe(
            'Header or query parameter name carrying the API key; only for type api_key',
        ),
    apiKeyLocation: z
        .enum(['header', 'query'])
        .nullable()
        .describe('Where the API key is sent; only for type api_key'),
    oauthScopes: z
        .array(z.string())
        .nullable()
        .describe(
            'Least-privilege Google OAuth scopes; only for type google_service_account',
        ),
    customHeaders: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .nullable()
        .describe(
            'Static non-secret headers required on every request (e.g. version headers). Never credentials.',
        ),
    allowedMethods: z
        .array(z.enum(EXTERNAL_CONNECTION_METHODS))
        .describe('HTTP methods the use case needs; least privilege'),
    allowedPathPrefixes: z
        .array(z.string())
        .describe(
            'Absolute path prefixes (starting with /) the connection may call; narrowest set that serves the use case',
        ),
    instructions: z
        .string()
        .nullable()
        .describe(
            'Guidance for the AI that builds data apps on this connection: key endpoints, request/response shapes, pagination, quirks',
        ),
    credentialGuide: z
        .string()
        .nullable()
        .describe(
            "Numbered markdown steps the user follows in the provider's console to obtain the credential; null for type none",
        ),
    docsUrl: z
        .string()
        .nullable()
        .describe(
            "URL of the provider's documentation page covering authentication/credentials",
        ),
    notes: z
        .string()
        .nullable()
        .describe(
            'Short caveats the user should double-check, e.g. region-specific hosts. Null when none.',
        ),
});

type RawProposal = z.infer<typeof ProposalSchema>;

export const buildProposalSystemPrompt = (): string =>
    `You configure outbound HTTP connections ("external connections") for Lightdash data apps. A connection is an egress allowlist plus auth config enforced by a server-side proxy. Propose exactly one connection config for the user's described integration.

FIELD SEMANTICS:
- origin: the https base URL of the API host — bare host, no path or query (e.g. https://sheets.googleapis.com).
- allowedPathPrefixes: absolute path prefixes (starting with /) the proxy allows, matched on whole path segments.
- allowedMethods: HTTP methods the proxy allows.
- type api_key: credential sent as a header or query parameter — set apiKeyName and apiKeyLocation.
- type bearer_token: credential sent as "Authorization: Bearer <token>".
- type google_service_account: service-account keyfile JSON with least-privilege oauthScopes.
- type none: public API, no credential.
- customHeaders: static NON-SECRET headers sent on every request (e.g. version headers like anthropic-version). Never put credentials here — credential-shaped header names are rejected.
- instructions: guidance for the AI that later builds data apps on this connection — key endpoints, request/response shapes, pagination, quirks. At most ~1500 characters.
- credentialGuide: numbered markdown steps the user follows in the provider's console to create or find the credential, using the least-privilege role/scope, ending with a link to the relevant docs page. Null only for type none.
- docsUrl: URL of the provider's authentication/credentials docs page.
- notes: short caveats the user must double-check (e.g. region-specific hosts, plan requirements). Null when none.

RULES:
- The origin MUST be the provider's official documented API host. Never guess lookalike domains or regional variants you are unsure about. If you cannot confidently identify a specific service, set confident=false and origin=null instead of guessing.
- Least privilege: propose the narrowest allowedPathPrefixes and allowedMethods that serve the described use case. GET-only unless the use case clearly needs writes. Use ["/"] only when the API genuinely requires broad path access.
- NEVER include, invent, or placeholder any credential value anywhere in the config.
- For Google-hosted APIs prefer type google_service_account with minimal scopes, and make credentialGuide mention sharing the target resource with the service account's client_email.
- At most ${MAX_PATH_PREFIXES} allowedPathPrefixes, ${MAX_CUSTOM_HEADERS} customHeaders, and ${MAX_OAUTH_SCOPES} oauthScopes.`;

const buildUserContent = (description: string): string =>
    `Set up a connection for this request:
"${description}"`;

const normalizeString = (value: string | null): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

const normalizeOrigin = (origin: string): string => {
    const trimmed = origin.trim();
    return trimmed.endsWith('/') && !trimmed.endsWith('//')
        ? trimmed.slice(0, -1)
        : trimmed;
};

const normalizeMethods = (
    methods: ExternalConnectionMethod[],
): ExternalConnectionMethod[] => {
    const unique = EXTERNAL_CONNECTION_METHODS.filter((method) =>
        methods.includes(method),
    );
    return unique.length > 0 ? unique : ['GET'];
};

const normalizePathPrefixes = (prefixes: string[]): string[] => {
    const cleaned = prefixes
        .map((prefix) => prefix.trim())
        .filter((prefix) => prefix.length > 0)
        .map((prefix) => (prefix.startsWith('/') ? prefix : `/${prefix}`));
    const unique = [...new Set(cleaned)].slice(0, MAX_PATH_PREFIXES);
    return unique.length > 0 ? unique : ['/'];
};

const normalizeCustomHeaders = (
    headers: Array<{ name: string; value: string }> | null,
): Record<string, string> | null => {
    if (headers === null) return null;
    const entries = headers
        .map(({ name, value }) => [name.trim(), value.trim()] as const)
        .filter(([name, value]) => name.length > 0 && value.length > 0)
        .slice(0, MAX_CUSTOM_HEADERS);
    if (entries.length === 0) return null;
    return Object.fromEntries(entries);
};

const isHttpsUrl = (value: string): boolean => {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
};

export const normalizeProposal = (
    raw: RawProposal & { origin: string },
): ExternalConnectionConfigProposal => {
    const origin = normalizeOrigin(raw.origin);
    const isApiKey = raw.type === 'api_key';
    const isGoogle = raw.type === 'google_service_account';
    const oauthScopes = isGoogle
        ? (raw.oauthScopes ?? [])
              .map((scope) => scope.trim())
              .filter((scope) => scope.length > 0)
              .slice(0, MAX_OAUTH_SCOPES)
        : null;
    const docsUrl = normalizeString(raw.docsUrl);
    let name = raw.name.trim();
    if (name.length === 0) {
        try {
            name = new URL(origin).hostname;
        } catch {
            name = origin;
        }
    }
    return {
        name,
        origin,
        type: raw.type,
        apiKeyName: isApiKey ? normalizeString(raw.apiKeyName) : null,
        apiKeyLocation: isApiKey ? (raw.apiKeyLocation ?? 'header') : null,
        oauthScopes,
        customHeaders: normalizeCustomHeaders(raw.customHeaders),
        allowedMethods: normalizeMethods(raw.allowedMethods),
        allowedPathPrefixes: normalizePathPrefixes(raw.allowedPathPrefixes),
        instructions: normalizeString(raw.instructions),
        credentialGuide:
            raw.type === 'none' ? null : normalizeString(raw.credentialGuide),
        docsUrl: docsUrl !== null && isHttpsUrl(docsUrl) ? docsUrl : null,
        notes: normalizeString(raw.notes),
    };
};

const toValidatableConfig = (
    proposal: ExternalConnectionConfigProposal,
): ValidatableExternalConnectionConfig => ({
    type: proposal.type,
    origin: proposal.origin,
    instructions: proposal.instructions,
    allowedPathPrefixes: proposal.allowedPathPrefixes,
    allowedMethods: proposal.allowedMethods,
    allowedContentTypes: PROPOSAL_ALLOWED_CONTENT_TYPES,
    apiKeyName: proposal.apiKeyName,
    apiKeyLocation: proposal.apiKeyLocation,
    oauthScopes: proposal.oauthScopes,
    customHeaders: proposal.customHeaders,
});

const getValidationError = (
    proposal: ExternalConnectionConfigProposal,
): string | null => {
    try {
        validateExternalConnectionConfig(
            toValidatableConfig(proposal),
            proposal.type !== 'none',
        );
        return null;
    } catch (error) {
        if (error instanceof ParameterError) return error.message;
        throw error;
    }
};

export async function generateExternalConnectionConfigProposal(
    modelOptions: GeneratorModelOptions,
    description: string,
): Promise<ExternalConnectionConfigProposal> {
    const systemPrompt = buildProposalSystemPrompt();
    const userContent = buildUserContent(description);

    const callLLM = async (
        extraMessages: Array<{
            role: 'user' | 'assistant';
            content: string;
        }> = [],
    ) => {
        const telemetry = getGeneratorTelemetry(
            modelOptions,
            'generateExternalConnectionConfig',
            'external-connection-config',
        );
        const result = await generateObject({
            model: modelOptions.model,
            ...modelOptions.callOptions,
            providerOptions: modelOptions.providerOptions,
            experimental_telemetry: telemetry,
            schema: ProposalSchema,
            abortSignal: AbortSignal.timeout(PROPOSAL_TIMEOUT_MS),
            system: systemPrompt,
            messages: [
                { role: 'user', content: userContent },
                ...extraMessages,
            ],
        });
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
        return result.object;
    };

    const assertConfident = (
        raw: RawProposal,
    ): RawProposal & { origin: string } => {
        const origin = raw.origin?.trim();
        if (!raw.confident || !origin) {
            throw new ParameterError(NOT_CONFIDENT_MESSAGE);
        }
        return { ...raw, origin };
    };

    let raw = await callLLM();
    let proposal = normalizeProposal(assertConfident(raw));

    const validationError = getValidationError(proposal);
    if (validationError) {
        Logger.debug(
            `AI-proposed connection config failed validation: ${validationError}. Retrying...`,
        );
        raw = await callLLM([
            { role: 'assistant', content: JSON.stringify(raw) },
            {
                role: 'user',
                content: `The proposed connection config is invalid: "${validationError}". Fix the config and return the corrected proposal. Remember the field rules from the system prompt.`,
            },
        ]);
        proposal = normalizeProposal(assertConfident(raw));

        const retryError = getValidationError(proposal);
        if (retryError) {
            Logger.warn(
                `AI-proposed connection config failed validation after retry: ${retryError}`,
            );
            throw new UnexpectedServerError(
                'Failed to generate a valid connection proposal. Try again, or set the connection up manually.',
            );
        }
    }

    return proposal;
}
