import { assertUnreachable } from '@lightdash/common';
import {
    APIUserAbortError as TypeSafeAbortError,
    APIError as TypeSafeApiError,
    TypeSafeClient,
    APITimeoutError as TypeSafeTimeoutError,
    type EntryType,
} from '@typesafe-ai/sdk';
import OpenAI from 'openai';
import { Agent, type Dispatcher } from 'undici';
import { z } from 'zod';
import type { LightdashConfig } from '../../../../config/parseConfig';
import Logger from '../../../../logging/logger';
import { traceSpan, type TraceSpan } from '../../../../tracing/tracing';

export type DecisionQuestion =
    | { type: 'noul'; instructions: string }
    | {
          type: 'choice';
          instructions: string;
          criteria: Record<string, string | null>;
      }
    | {
          type: 'score';
          instructions: string;
          /** An ordered rubric of at least two levels, as the provider requires. */
          criteria: readonly [string, string, ...string[]];
      };

const probability = z.number().finite().min(0).max(1);
const answerSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('noul'), noul: probability }),
    z.object({
        type: z.literal('choice'),
        choice: z.string(),
        confidence: probability,
        probabilities: z.record(z.string(), probability),
    }),
    z.object({
        type: z.literal('score'),
        score: z.number().finite(),
        confidence: probability,
    }),
]);
const usageSchema = z.object({
    input_tokens: z.number().finite().nonnegative(),
    output_tokens: z.number().finite().nonnegative(),
});
const responseSchema = z.object({
    model: z.string(),
    answers: z.record(z.string(), answerSchema),
    usage: usageSchema.optional(),
});
const MAX_DECISION_PAYLOAD_BYTES = 100_000;
const MAX_DECISION_TIMEOUT_MS = 2_000;
const LOGGED_OPERATIONS = new Set([
    'agent-readiness',
    'agent-routing',
    'answer-claims',
    'catalog-ranking',
    'chart-edit',
    'chart-intent',
    'chart-presentation',
    'chart-reuse',
    'chart-title',
    'composer-viz',
    'content-relevance',
    'context-preload',
    'correction-pick',
    'dashboard-layout',
    'document-edit',
    'empty-result-diagnosis',
    'field-recovery',
    'filter-value',
    'mcp-error',
    'model-routing',
    'project-routing',
    'query-error',
    'query-intent',
    'query-plan-intent',
    'response-error',
    'response-signals',
    'review-evidence',
    'verified-answer-relevance',
    'warehouse-table-ranking',
    'writeback-source',
]);

export type DecisionAnswers = z.infer<typeof responseSchema>['answers'];
export type AiDecisionUsage = {
    inputTokens: number;
    outputTokens: number;
    /** JEV's own processing time, summed across calls; null until the provider reports one. */
    serviceMs: number | null;
};

// Each provider reports how long its model service spent on the request.
const SERVICE_TIME_HEADERS = {
    jev: 'x-envoy-upstream-service-time',
    luna: 'openai-processing-ms',
} as const;
// Turns arrive seconds apart, past fetch's default keep-alive, so every turn paid a new TLS handshake.
const KEEP_ALIVE_DISPATCHER = new Agent({
    keepAliveTimeout: 300_000,
    keepAliveMaxTimeout: 300_000,
});
export type DecisionConfig = LightdashConfig['ai']['decisions'];
export type DecisionProvider = NonNullable<DecisionConfig['provider']>;

class DecisionResponseTooLarge extends Error {}

type DecisionOutcome =
    | 'skipped'
    | 'request-failed'
    | 'state-too-large'
    | 'invalid-response'
    | 'provider-http-error'
    | 'cancelled'
    | 'timeout'
    | 'success';

const spanOutcome = (
    outcome: DecisionOutcome,
): 'answered' | 'unavailable' | 'timeout' | 'error' => {
    switch (outcome) {
        case 'success':
            return 'answered';
        case 'skipped':
        case 'state-too-large':
        case 'cancelled':
            return 'unavailable';
        case 'timeout':
            return 'timeout';
        case 'request-failed':
        case 'invalid-response':
        case 'provider-http-error':
            return 'error';
        default:
            return assertUnreachable(outcome, 'Unknown decision outcome');
    }
};

/** Provider fetch: our keep-alive pool, and a size cap since the SDKs buffer whole bodies. */
const pooledFetch =
    (request: typeof fetch) =>
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const response = await request(input, {
            ...init,
            ...({ dispatcher: KEEP_ALIVE_DISPATCHER } as {
                dispatcher: Dispatcher;
            }),
        });
        const length = Number(response.headers.get('content-length'));
        if (Number.isFinite(length) && length > MAX_DECISION_PAYLOAD_BYTES) {
            await response.body?.cancel();
            throw new DecisionResponseTooLarge();
        }
        return response;
    };

type TransportRequest = {
    state: EntryType;
    questions: Record<string, DecisionQuestion>;
    signal: AbortSignal | undefined;
    timeout: number;
};
/** Returns the provider's answers in JEV's shape; `responseSchema` validates the result. */
type DecisionTransport = (
    request: TransportRequest,
) => Promise<{ data: unknown; serviceMs: number | null }>;

const headerMs = (response: Response, header: string): number | null => {
    const value = Number(response.headers.get(header) ?? Number.NaN);
    return Number.isFinite(value) ? value : null;
};

const createJevTransport = (
    config: DecisionConfig,
    request: typeof fetch,
): DecisionTransport => {
    const sdk = new TypeSafeClient({
        apiKey: config.apiKey ?? '',
        defaultModel: config.model,
        timeout: MAX_DECISION_TIMEOUT_MS,
        // A retry turns a fast fallback into a slow one on a turn-latency budget.
        retry: { maxRetries: 0 },
        // Provider errors can carry user data; outcomes are logged locally instead.
        logLevel: 'off',
        fetch: pooledFetch(request),
    });
    return async ({ state, questions, signal, timeout }) => {
        const { data, response } = await sdk
            .systemOne(
                { state, questions, model: config.model },
                { signal, timeout },
            )
            .withResponse();
        return {
            data,
            serviceMs: headerMs(response, SERVICE_TIME_HEADERS.jev),
        };
    };
};

type LunaQuestion = OpenAI.DecisionCreateParams['questions'][number];
const toLunaQuestion = (
    name: string,
    question: DecisionQuestion,
): LunaQuestion => {
    switch (question.type) {
        case 'noul':
            return {
                type: 'predicate',
                name,
                instructions: question.instructions,
            };
        case 'choice':
            return {
                type: 'choice',
                name,
                instructions: question.instructions,
                choices: Object.entries(question.criteria).map(
                    ([value, description]) =>
                        description === null
                            ? { value }
                            : { value, description },
                ),
            };
        case 'score':
            return {
                type: 'score',
                name,
                instructions: question.instructions,
                levels: question.criteria.map((label) => ({ label })),
            };
        default:
            return assertUnreachable(question, 'Unknown decision question');
    }
};

type LunaAnswer = OpenAI.Decision['answers'][number];
const fromLunaAnswer = (answer: LunaAnswer): DecisionAnswers[string] | null => {
    switch (answer.type) {
        case 'predicate':
            return { type: 'noul', noul: answer.probability };
        case 'choice':
            return {
                type: 'choice',
                choice: String(answer.choice),
                confidence: answer.confidence,
                probabilities: Object.fromEntries(
                    answer.probabilities.map((option) => [
                        String(option.value),
                        option.probability,
                    ]),
                ),
            };
        case 'score':
            return {
                type: 'score',
                score: answer.score,
                confidence: answer.confidence,
            };
        // A refused question is left unanswered, which fails validation and takes the legacy path.
        case 'refusal':
            return null;
        default:
            return assertUnreachable(answer, 'Unknown decision answer');
    }
};

/** OpenAI's Decisions API, translated to and from JEV's question and answer shapes. */
const createLunaTransport = (
    config: DecisionConfig,
    request: typeof fetch,
): DecisionTransport => {
    const sdk = new OpenAI({
        apiKey: config.apiKey ?? '',
        timeout: MAX_DECISION_TIMEOUT_MS,
        maxRetries: 0,
        logLevel: 'off',
        fetch: pooledFetch(request),
    });
    return async ({ state, questions, signal, timeout }) => {
        const { data, response } = await sdk.decisions
            .create(
                {
                    model: config.model,
                    input: JSON.stringify(state),
                    questions: Object.entries(questions).map(([name, q]) =>
                        toLunaQuestion(name, q),
                    ),
                },
                { signal, timeout },
            )
            .withResponse();
        const answers: Record<string, DecisionAnswers[string]> = {};
        for (const answer of data.answers) {
            const converted = fromLunaAnswer(answer);
            if (answer.name !== null && converted)
                answers[answer.name] = converted;
        }
        return {
            data: { model: data.model, answers, usage: data.usage },
            serviceMs: headerMs(response, SERVICE_TIME_HEADERS.luna),
        };
    };
};

const createTransport = (
    config: DecisionConfig,
    request: typeof fetch,
): DecisionTransport => {
    const provider = config.provider ?? 'jev';
    switch (provider) {
        case 'jev':
            return createJevTransport(config, request);
        case 'luna':
            return createLunaTransport(config, request);
        default:
            return assertUnreachable(provider, 'Unknown decision provider');
    }
};

type EvaluateArgs = {
    operation: string;
    state: unknown;
    questions: Record<string, DecisionQuestion>;
    signal?: AbortSignal;
    /** Per-call budget for larger batched requests; capped at the client maximum. */
    timeoutMs?: number;
};
type DecisionHealth = { consecutiveFailures: number; retryAfter: number };

export type DecisionEvaluation = {
    answers: DecisionAnswers | null;
    outcome: DecisionOutcome;
    durationMs: number;
    serviceMs: number | null;
};
type DecisionShadowSide = DecisionEvaluation & {
    provider: DecisionProvider;
    model: string;
};
/** One live decision and the same questions answered by a second provider that nobody acted on. */
export type DecisionShadowEntry = {
    operation: string;
    questions: Record<string, DecisionQuestion>;
    state: unknown;
    live: DecisionShadowSide;
    shadow: DecisionShadowSide;
};
export type DecisionShadow = {
    client: AiDecisionClient;
    record: (entry: DecisionShadowEntry) => Promise<void>;
};

/** Throws on answers the questions cannot have produced; reconciles two-decimal rounding drift. */
const validateAnswers = (
    questions: Record<string, DecisionQuestion>,
    answers: DecisionAnswers,
): DecisionAnswers => {
    for (const [key, question] of Object.entries(questions)) {
        const answer = answers[key];
        if (!answer || answer.type !== question.type) {
            throw new Error('Invalid decision response');
        }
        if (question.type === 'choice' && answer.type === 'choice') {
            const probabilities = Object.values(answer.probabilities);
            const mass = probabilities.reduce((sum, value) => sum + value, 0);
            // Live responses round distributions to two decimal places.
            const rounded = probabilities.every(
                (value) =>
                    Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
            );
            const complete =
                Object.keys(question.criteria).length === probabilities.length;
            const tolerance =
                rounded && complete
                    ? Math.min(0.02, probabilities.length * 0.005) + 1e-8
                    : 0.001;
            if (
                !Object.hasOwn(question.criteria, answer.choice) ||
                !Object.hasOwn(answer.probabilities, answer.choice) ||
                Math.abs(mass - 1) > tolerance ||
                Object.keys(answer.probabilities).some(
                    (option) => !Object.hasOwn(question.criteria, option),
                )
            ) {
                throw new Error('Invalid decision option');
            }
            // Never raise a probability when reconciling rounding drift.
            if (mass > 1)
                answer.probabilities = Object.fromEntries(
                    Object.entries(answer.probabilities).map(
                        ([option, value]) => [option, value / mass],
                    ),
                );
        }
        if (
            question.type === 'score' &&
            answer.type === 'score' &&
            (answer.score < 0 || answer.score > question.criteria.length - 1)
        ) {
            throw new Error('Invalid decision score');
        }
    }
    return answers;
};

const SKIPPED: DecisionEvaluation = {
    answers: null,
    outcome: 'skipped',
    durationMs: 0,
    serviceMs: null,
};

export class AiDecisionClient {
    private readonly transport: DecisionTransport;

    constructor(
        private readonly config: DecisionConfig,
        private readonly request: typeof fetch = fetch,
        private readonly usage?: AiDecisionUsage,
        private readonly health: DecisionHealth = {
            consecutiveFailures: 0,
            retryAfter: 0,
        },
        transport?: DecisionTransport,
        private readonly shadow?: DecisionShadow,
    ) {
        this.transport = transport ?? createTransport(config, request);
    }

    withUsage(usage: AiDecisionUsage): AiDecisionClient {
        return new AiDecisionClient(
            this.config,
            this.request,
            usage,
            this.health,
            this.transport,
            this.shadow,
        );
    }

    /** Every live decision is also sent to `shadow.client`; both results go to `shadow.record`. */
    withShadow(shadow: DecisionShadow | undefined): AiDecisionClient {
        if (!shadow) return this;
        return new AiDecisionClient(
            this.config,
            this.request,
            this.usage,
            this.health,
            this.transport,
            shadow,
        );
    }

    get modelName(): string {
        return this.config.model;
    }

    get provider(): DecisionProvider {
        return this.config.provider ?? 'jev';
    }

    async evaluate(args: EvaluateArgs): Promise<DecisionAnswers | null> {
        const live = await this.evaluateWithOutcome(args);
        if (this.shadow && live.outcome !== 'skipped')
            void this.runShadow(args, live);
        return live.answers;
    }

    async evaluateWithOutcome(args: EvaluateArgs): Promise<DecisionEvaluation> {
        // Provider errors and request options can contain credentials or
        // user data. Only allowlisted operations and local outcomes are logged.
        const loggedOperation = LOGGED_OPERATIONS.has(args.operation)
            ? args.operation
            : 'unknown';
        return traceSpan(
            {
                op: 'ai.decision',
                name: `ai.decision.${loggedOperation}`,
                attributes: { 'lightdash.decision.operation': loggedOperation },
            },
            (span) => this.evaluateInSpan(args, loggedOperation, span),
        );
    }

    private async runShadow(
        args: EvaluateArgs,
        live: DecisionEvaluation,
    ): Promise<void> {
        if (!this.shadow) return;
        try {
            // The shadow gets the client maximum so slow answers are still recorded, with their time.
            const shadow = await this.shadow.client.evaluateWithOutcome({
                ...args,
                timeoutMs: MAX_DECISION_TIMEOUT_MS,
            });
            await this.shadow.record({
                operation: args.operation,
                questions: args.questions,
                state: args.state,
                live: {
                    ...live,
                    provider: this.provider,
                    model: this.modelName,
                },
                shadow: {
                    ...shadow,
                    provider: this.shadow.client.provider,
                    model: this.shadow.client.modelName,
                },
            });
        } catch {
            Logger.warn('AI agent decision shadow failed');
        }
    }

    private async evaluateInSpan(
        { state, questions, signal, timeoutMs }: EvaluateArgs,
        loggedOperation: string,
        span: TraceSpan,
    ): Promise<DecisionEvaluation> {
        if (
            !this.config.apiKey ||
            signal?.aborted ||
            Date.now() < this.health.retryAfter ||
            Object.keys(questions).length === 0 ||
            Object.keys(questions).length > 64 ||
            Object.values(questions).some(
                (q) =>
                    (q.type === 'score' && q.criteria.length < 2) ||
                    (q.type === 'choice' &&
                        (Object.keys(q.criteria).length < 2 ||
                            Object.keys(q.criteria).length > 255)),
            )
        ) {
            span.setAttributes({
                'lightdash.decision.outcome': spanOutcome('skipped'),
                'lightdash.decision.durationMs': 0,
            });
            return SKIPPED;
        }

        const startedAt = performance.now();
        let outcome: DecisionOutcome = 'request-failed';
        let retryableFailure = true;
        let answers: DecisionAnswers | null = null;
        let serviceMs: number | null = null;
        try {
            const body = JSON.stringify({
                model: this.config.model,
                state,
                questions,
            });
            if (Buffer.byteLength(body) > MAX_DECISION_PAYLOAD_BYTES) {
                outcome = 'state-too-large';
                return SKIPPED;
            }
            // JSON round-trip matches what the size check measured and yields a JSON value.
            const jsonState: EntryType = JSON.parse(
                JSON.stringify(state ?? null),
            );
            const response = await this.transport({
                state: jsonState,
                questions,
                signal,
                timeout: Math.min(
                    Math.max(timeoutMs ?? 0, this.config.timeoutMs),
                    MAX_DECISION_TIMEOUT_MS,
                ),
            });
            serviceMs = response.serviceMs;
            if (serviceMs !== null) {
                span.setAttribute('lightdash.decision.serviceMs', serviceMs);
                if (this.usage)
                    this.usage.serviceMs =
                        (this.usage.serviceMs ?? 0) + serviceMs;
            }
            outcome = 'invalid-response';
            retryableFailure = false;
            const rawResponse: unknown = response.data;
            const providerUsage = z
                .object({ usage: usageSchema.optional() })
                .safeParse(rawResponse);
            if (
                providerUsage.success &&
                providerUsage.data.usage &&
                this.usage
            ) {
                this.usage.inputTokens += providerUsage.data.usage.input_tokens;
                this.usage.outputTokens +=
                    providerUsage.data.usage.output_tokens;
            }
            const parsed = responseSchema.parse(rawResponse);
            answers = validateAnswers(questions, parsed.answers);
            this.health.consecutiveFailures = 0;
            this.health.retryAfter = 0;
            outcome = 'success';
        } catch (error) {
            const status =
                error instanceof TypeSafeApiError ||
                error instanceof OpenAI.APIError
                    ? error.status
                    : undefined;
            if (
                signal?.aborted ||
                error instanceof TypeSafeAbortError ||
                error instanceof OpenAI.APIUserAbortError
            ) {
                outcome = 'cancelled';
                retryableFailure = false;
            } else if (
                error instanceof TypeSafeTimeoutError ||
                error instanceof OpenAI.APIConnectionTimeoutError
            ) {
                outcome = 'timeout';
            } else if (status !== undefined) {
                outcome = 'provider-http-error';
                retryableFailure = status === 429 || status >= 500;
            }
            if (!signal?.aborted && retryableFailure) {
                this.health.consecutiveFailures += 1;
                if (this.health.consecutiveFailures >= 3) {
                    this.health.retryAfter = Date.now() + 30_000;
                }
            }
        } finally {
            const durationMs = Math.round(performance.now() - startedAt);
            span.setAttributes({
                'lightdash.decision.outcome': spanOutcome(outcome),
                'lightdash.decision.durationMs': durationMs,
            });
            Logger.debug(
                `AI agent decision: ${loggedOperation}, outcome=${outcome}, durationMs=${durationMs}`,
            );
        }
        return {
            answers,
            outcome,
            durationMs: Math.round(performance.now() - startedAt),
            serviceMs,
        };
    }
}

const clients = new WeakMap<DecisionConfig, AiDecisionClient>();

// Client state is reusable; feature availability is resolved per request below.
const getAiDecisionClient = (
    config: DecisionConfig,
): AiDecisionClient | undefined => {
    if (!config?.apiKey) return undefined;
    let client = clients.get(config);
    if (!client) {
        client = new AiDecisionClient(config);
        clients.set(config, client);
    }
    return client;
};

/** Resolve per request so disabling the flag takes effect without a restart.
 * Decision availability is optional; resolver failures keep the legacy path. */
export const resolveAiDecisionClient = async (
    config: DecisionConfig | undefined,
    getFlag: () => Promise<{ enabled: boolean }>,
): Promise<AiDecisionClient | undefined> => {
    if (!config?.apiKey) return undefined;
    try {
        return (await getFlag()).enabled
            ? getAiDecisionClient(config)
            : undefined;
    } catch {
        return undefined;
    }
};

export const confidentChoice = (
    answer: DecisionAnswers[string] | undefined,
    threshold = 0.9,
): string | null =>
    answer?.type === 'choice' &&
    answer.confidence >= threshold &&
    answer.probabilities[answer.choice] >= threshold
        ? answer.choice
        : null;

export const decisionProbability = (
    answer: DecisionAnswers[string] | undefined,
): number | null => (answer?.type === 'noul' ? answer.noul : null);
