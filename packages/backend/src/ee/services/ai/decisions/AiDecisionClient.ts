import { assertUnreachable } from '@lightdash/common';
import {
    APIUserAbortError as TypeSafeAbortError,
    APIError as TypeSafeApiError,
    TypeSafeClient,
    APITimeoutError as TypeSafeTimeoutError,
    type EntryType,
} from '@typesafe-ai/sdk';
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

// The provider reports how long its model service spent on the request.
const SERVICE_TIME_HEADER = 'x-envoy-upstream-service-time';
// Turns arrive seconds apart, past fetch's default keep-alive, so every turn paid a new TLS handshake.
const KEEP_ALIVE_DISPATCHER = new Agent({
    keepAliveTimeout: 300_000,
    keepAliveMaxTimeout: 300_000,
});
export type DecisionConfig = LightdashConfig['ai']['decisions'];

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

/** Provider fetch: our keep-alive pool, and a size cap since the SDK buffers whole bodies. */
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
/** Returns the provider's answers; `responseSchema` validates the result. */
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
            serviceMs: headerMs(response, SERVICE_TIME_HEADER),
        };
    };
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
    ) {
        this.transport = transport ?? createJevTransport(config, request);
    }

    withUsage(usage: AiDecisionUsage): AiDecisionClient {
        return new AiDecisionClient(
            this.config,
            this.request,
            usage,
            this.health,
            this.transport,
        );
    }

    get modelName(): string {
        return this.config.model;
    }

    async evaluate(args: EvaluateArgs): Promise<DecisionAnswers | null> {
        return (await this.evaluateWithOutcome(args)).answers;
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
                error instanceof TypeSafeApiError ? error.status : undefined;
            if (signal?.aborted || error instanceof TypeSafeAbortError) {
                outcome = 'cancelled';
                retryableFailure = false;
            } else if (error instanceof TypeSafeTimeoutError) {
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

// Configs are reused per deployment, so outage backoff is shared across requests.
export const resolveAiDecisionClient = (
    config: DecisionConfig | undefined,
): AiDecisionClient | undefined => {
    if (!config?.apiKey) return undefined;
    let client = clients.get(config);
    if (!client) {
        client = new AiDecisionClient(config);
        clients.set(config, client);
    }
    return client;
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
