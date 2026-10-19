import { type AgentSuggestion } from '@lightdash/common';
import {
    buildSuggestionCacheKey,
    SuggestionFallbackCache,
} from './suggestionFallbackCache';

const chips: AgentSuggestion[] = [
    {
        kind: 'prompt',
        label: 'Find existing charts',
        tool: 'findContent',
        defaults: {
            explore: null,
            dimensions: [],
            metrics: [],
            timeframe: null,
        },
    },
];
const input = {
    organizationUuid: 'org',
    projectUuid: 'project',
    agentUuid: 'agent',
    userUuid: 'user',
    enableSqlMode: false,
    context: null,
    threadUuid: null,
    afterMessageUuid: null,
};

describe('SuggestionFallbackCache', () => {
    it('stores deep copies on set and get', () => {
        const cache = new SuggestionFallbackCache();
        const original = structuredClone(chips);
        cache.set('key', original);
        original[0].label = 'changed';
        const copy = cache.get('key')!;
        expect(copy).toEqual(chips);
        if (copy[0].kind === 'prompt')
            copy[0].defaults.dimensions.push('changed');
        expect(cache.get('key')).toEqual(chips);
        expect(cache.get('missing')).toBeNull();
    });
    it('expires entries without extending their TTL on reads', () => {
        let now = 0;
        const cache = new SuggestionFallbackCache(2, 100, () => now);
        cache.set('key', chips);
        now = 99;
        expect(cache.get('key')).toEqual(chips);
        now = 100;
        expect(cache.get('key')).toBeNull();
    });
    it('evicts the least recently used entry', () => {
        const cache = new SuggestionFallbackCache(2);
        cache.set('a', chips);
        cache.set('b', chips);
        cache.get('a');
        cache.set('c', chips);
        expect(cache.get('b')).toBeNull();
        expect(cache.get('a')).toEqual(chips);
        cache.set('a', chips);
        cache.set('d', chips);
        expect(cache.get('c')).toBeNull();
    });
    it('scopes entries by identity, mode, context, thread and turn', () => {
        const base = buildSuggestionCacheKey(input);
        for (const changes of [
            { organizationUuid: 'other' },
            { projectUuid: 'other' },
            { agentUuid: 'other' },
            { userUuid: 'other' },
            { enableSqlMode: true },
            { context: { type: 'chart' as const, chartUuid: 'chart' } },
        ])
            expect(buildSuggestionCacheKey({ ...input, ...changes })).not.toBe(
                base,
            );
        const turn = {
            ...input,
            threadUuid: 'thread',
            afterMessageUuid: 'message-1',
        };
        expect(buildSuggestionCacheKey(turn)).not.toBe(
            buildSuggestionCacheKey({ ...turn, afterMessageUuid: 'message-2' }),
        );
        expect(buildSuggestionCacheKey(turn)).not.toBe(
            buildSuggestionCacheKey({ ...turn, threadUuid: 'other' }),
        );
    });
});
