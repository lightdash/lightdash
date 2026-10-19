import {
    type AgentSuggestion,
    type AiAgentSuggestionContext,
} from '@lightdash/common';

type SuggestionCacheKeyInput = {
    organizationUuid: string;
    projectUuid: string;
    agentUuid: string;
    userUuid: string;
    enableSqlMode: boolean;
    context: AiAgentSuggestionContext | null;
    threadUuid: string | null;
    afterMessageUuid: string | null;
};

export const buildSuggestionCacheKey = (
    input: SuggestionCacheKeyInput,
): string =>
    JSON.stringify([
        input.organizationUuid,
        input.projectUuid,
        input.agentUuid,
        input.userUuid,
        input.enableSqlMode,
        input.context
            ? [
                  input.context.type,
                  input.context.type === 'chart'
                      ? input.context.chartUuid
                      : input.context.dashboardUuid,
              ]
            : 'none',
        input.threadUuid,
        input.threadUuid ? input.afterMessageUuid : null,
    ]);

// Each process keeps its own fallback cache.
export class SuggestionFallbackCache {
    private readonly entries = new Map<
        string,
        { chips: AgentSuggestion[]; expiresAt: number }
    >();

    constructor(
        private readonly maxEntries = 2000,
        private readonly ttlMs = 6 * 60 * 60 * 1000,
        private readonly clock = Date.now,
    ) {}

    public set(key: string, chips: AgentSuggestion[]): void {
        this.entries.delete(key);
        if (this.maxEntries <= 0) return;
        this.entries.set(key, {
            chips: structuredClone(chips),
            expiresAt: this.clock() + this.ttlMs,
        });
        while (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey !== undefined) this.entries.delete(oldestKey);
        }
    }

    public get(key: string): AgentSuggestion[] | null {
        const entry = this.entries.get(key);
        if (!entry) return null;
        this.entries.delete(key);
        if (entry.expiresAt <= this.clock()) return null;
        this.entries.set(key, entry);
        return structuredClone(entry.chips);
    }
}
