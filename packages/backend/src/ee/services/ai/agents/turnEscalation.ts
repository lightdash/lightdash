import type { ModelMessage } from 'ai';

export type EscalationReason = 'requested-context' | 'stalled-recovery';

export const ESCALATION_GUIDANCE =
    'Reassess this request with the full available toolbox. Earlier catalog rankings and preloaded references are partial evidence, not exhaustive definitions. Load missing project context, knowledge documents, catalog metadata or MCP context through their available tools before drawing conclusions. Preserve the user’s measure, filters, dates and instructions. Do not repeat an unchanged failed operation, replay a write, bypass permissions or exceed retry limits. If evidence remains insufficient, ask a focused question or explain the limitation. Keep this internal recovery guidance out of the answer.';

/** Structured tool outcomes only; no customer-specific text or error matching. */
export const createTurnEscalation = (
    enabled: boolean,
    history: ModelMessage[],
) => {
    const historicalIds = new Set(
        (enabled ? history : []).flatMap((message) =>
            message.role === 'tool'
                ? message.content.flatMap((part) =>
                      part.type === 'tool-result' ? [part.toolCallId] : [],
                  )
                : [],
        ),
    );
    let reason: EscalationReason | null = null;
    return {
        get reason() {
            return reason;
        },
        observe(messages: ModelMessage[]): EscalationReason | null {
            if (!enabled || reason) return null;
            let failures = 0;
            let errors = 0;
            let successes = 0;
            const seen = new Set(historicalIds);
            const finishRound = () => {
                if (successes > 0) failures = 0;
                else if (errors > 0) failures += 1;
                errors = 0;
                successes = 0;
            };
            for (const message of messages) {
                if (message.role !== 'tool') {
                    finishRound();
                } else {
                    for (const part of message.content) {
                        if (
                            part.type === 'tool-result' &&
                            !seen.has(part.toolCallId)
                        ) {
                            seen.add(part.toolCallId);
                            const failed =
                                part.output.type === 'error-text' ||
                                part.output.type === 'error-json';
                            if (part.toolName === 'loadAgentTools' && !failed) {
                                reason = 'requested-context';
                                return reason;
                            }
                            if (failed) errors += 1;
                            else successes += 1;
                        }
                    }
                }
            }
            finishRound();
            if (failures >= 2) reason = 'stalled-recovery';
            return reason;
        },
    };
};

export type TurnEscalation = ReturnType<typeof createTurnEscalation>;
