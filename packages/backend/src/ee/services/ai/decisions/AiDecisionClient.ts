import { z } from 'zod';
import type { LightdashConfig } from '../../../../config/parseConfig';
import Logger from '../../../../logging/logger';

export type DecisionQuestion =
    | { type: 'noul'; instructions: string }
    | {
          type: 'choice';
          instructions: string;
          criteria: Record<string, string | null>;
      }
    | { type: 'score'; instructions: string; criteria: string[] };

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
const LOGGED_OPERATIONS = new Set([
    'agent-readiness',
    'agent-routing',
    'answer-claims',
    'catalog-ranking',
    'chart-edit',
    'chart-intent',
    'chart-presentation',
    'chart-reuse',
    'content-relevance',
    'context-preload',
    'dashboard-layout',
    'empty-result-diagnosis',
    'field-recovery',
    'filter-value',
    'mcp-error',
    'model-routing',
    'project-routing',
    'query-error',
    'query-intent',
    'query-plan-intent',
    'quick-replies',
    'response-error',
    'response-signals',
    'review-evidence',
    'verified-answer-relevance',
    'warehouse-table-ranking',
    'writeback-source',
]);

const readBoundedJson = async (response: Response): Promise<unknown> => {
    const contentLength = Number(response.headers.get('content-length'));
    if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_DECISION_PAYLOAD_BYTES
    ) {
        await response.body?.cancel();
        throw new Error('Decision provider response too large');
    }
    if (!response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            // The provider response is small; serial reads enforce the cap.
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_DECISION_PAYLOAD_BYTES) {
                // eslint-disable-next-line no-await-in-loop
                await reader.cancel();
                throw new Error('Decision provider response too large');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

export type DecisionAnswers = z.infer<typeof responseSchema>['answers'];
export type AiDecisionUsage = {
    inputTokens: number;
    outputTokens: number;
};
type DecisionConfig = LightdashConfig['ai']['decisions'];
type DecisionHealth = { consecutiveFailures: number; retryAfter: number };

export class AiDecisionClient {
    constructor(
        private readonly config: DecisionConfig,
        private readonly request: typeof fetch = fetch,
        private readonly usage?: AiDecisionUsage,
        private readonly health: DecisionHealth = {
            consecutiveFailures: 0,
            retryAfter: 0,
        },
    ) {}

    withUsage(usage: AiDecisionUsage): AiDecisionClient {
        return new AiDecisionClient(
            this.config,
            this.request,
            usage,
            this.health,
        );
    }

    get modelName(): string {
        return this.config.model;
    }

    async evaluate({
        operation,
        state,
        questions,
        signal,
    }: {
        operation: string;
        state: unknown;
        questions: Record<string, DecisionQuestion>;
        signal?: AbortSignal;
    }): Promise<DecisionAnswers | null> {
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
            return null;
        }

        const startedAt = performance.now();
        let outcome = 'request-failed';
        let retryableFailure = true;
        try {
            const body = JSON.stringify({
                model: this.config.model,
                state,
                questions,
            });
            if (Buffer.byteLength(body) > MAX_DECISION_PAYLOAD_BYTES) {
                outcome = 'state-too-large';
                return null;
            }
            const deadline = AbortSignal.timeout(this.config.timeoutMs);
            const response = await this.request(
                'https://api.typesafe.ai/v1/systemone',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body,
                    signal: signal
                        ? AbortSignal.any([signal, deadline])
                        : deadline,
                },
            );
            if (!response.ok) {
                outcome = 'provider-http-error';
                retryableFailure =
                    response.status === 429 || response.status >= 500;
                await response.body?.cancel();
                throw new Error('Decision provider unavailable');
            }
            outcome = 'invalid-response';
            retryableFailure = false;
            const rawResponse = await readBoundedJson(response);
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
            const { answers } = parsed;
            for (const [key, question] of Object.entries(questions)) {
                const answer = answers[key];
                if (!answer || answer.type !== question.type) {
                    throw new Error('Invalid decision response');
                }
                if (question.type === 'choice' && answer.type === 'choice') {
                    const probabilities = Object.values(answer.probabilities);
                    const mass = probabilities.reduce(
                        (sum, value) => sum + value,
                        0,
                    );
                    // Live responses round distributions to two decimal places.
                    const rounded = probabilities.every(
                        (value) =>
                            Math.abs(value * 100 - Math.round(value * 100)) <
                            1e-8,
                    );
                    const complete =
                        Object.keys(question.criteria).length ===
                        probabilities.length;
                    const tolerance =
                        rounded && complete
                            ? Math.min(0.02, probabilities.length * 0.005) +
                              1e-8
                            : 0.001;
                    if (
                        !Object.hasOwn(question.criteria, answer.choice) ||
                        !Object.hasOwn(answer.probabilities, answer.choice) ||
                        Math.abs(mass - 1) > tolerance ||
                        Object.keys(answer.probabilities).some(
                            (option) =>
                                !Object.hasOwn(question.criteria, option),
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
                    (answer.score < 0 ||
                        answer.score > question.criteria.length - 1)
                ) {
                    throw new Error('Invalid decision score');
                }
            }
            this.health.consecutiveFailures = 0;
            this.health.retryAfter = 0;
            outcome = 'success';
            return answers;
        } catch (error) {
            if (signal?.aborted) outcome = 'cancelled';
            else if (
                error instanceof DOMException &&
                error.name === 'TimeoutError'
            )
                outcome = 'timeout';
            if (!signal?.aborted && retryableFailure) {
                this.health.consecutiveFailures += 1;
                if (this.health.consecutiveFailures >= 3) {
                    this.health.retryAfter = Date.now() + 30_000;
                }
            }
            return null;
        } finally {
            // Provider errors and request options can contain credentials or
            // user data. Only allowlisted operations and local outcomes are logged.
            const loggedOperation = LOGGED_OPERATIONS.has(operation)
                ? operation
                : 'unknown';
            Logger.debug(
                `AI agent decision: ${loggedOperation}, outcome=${outcome}, durationMs=${Math.round(performance.now() - startedAt)}`,
            );
        }
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
