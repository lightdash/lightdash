import {
    DEFAULT_AUTOPILOT_VALIDATED_MODELS,
    getAutopilotCleanupMode,
    parseAutopilotValidatedModels,
} from './autopilotConfig';

describe('Autopilot model qualification', () => {
    it('defaults unscored models to observe', () => {
        expect(getAutopilotCleanupMode('cleanup', 'openai', 'model', [])).toBe(
            'observe',
        );
    });
    it('matches exact provider and model without upgrading the requested mode', () => {
        const approvals = [
            { provider: 'openai', model: 'approved', mode: 'cleanup' as const },
        ];
        expect(
            getAutopilotCleanupMode('flag', 'openai', 'approved', approvals),
        ).toBe('flag');
        expect(
            getAutopilotCleanupMode('cleanup', 'azure', 'approved', approvals),
        ).toBe('observe');
        expect(
            getAutopilotCleanupMode('cleanup', 'openai', 'other', approvals),
        ).toBe('observe');
    });
    it('uses the more restrictive approval when duplicated', () => {
        expect(
            getAutopilotCleanupMode('cleanup', 'anthropic', 'model', [
                { provider: 'anthropic', model: 'model', mode: 'cleanup' },
                { provider: 'anthropic', model: 'model', mode: 'flag' },
            ]),
        ).toBe('flag');
    });
    it('qualifies only the scored models when the variable is unset', () => {
        const defaults = parseAutopilotValidatedModels(undefined);
        expect(defaults).toBe(DEFAULT_AUTOPILOT_VALIDATED_MODELS);
        expect(
            getAutopilotCleanupMode(
                'cleanup',
                'anthropic',
                'claude-sonnet-5',
                defaults,
            ),
        ).toBe('cleanup');
        expect(
            getAutopilotCleanupMode(
                'cleanup',
                'openai',
                'gpt-5.4-2026-03-05',
                defaults,
            ),
        ).toBe('cleanup');
        expect(
            getAutopilotCleanupMode('cleanup', 'openai', 'gpt-5.4', defaults),
        ).toBe('observe');
        expect(
            getAutopilotCleanupMode(
                'cleanup',
                'bedrock',
                'anthropic.claude-sonnet-5',
                defaults,
            ),
        ).toBe('observe');
    });
    it('replaces the defaults when the variable is set', () => {
        expect(parseAutopilotValidatedModels('')).toEqual([]);
        expect(parseAutopilotValidatedModels('  ')).toEqual([]);
        expect(parseAutopilotValidatedModels('[]')).toEqual([]);
        expect(
            parseAutopilotValidatedModels(
                '[{"provider":"azure","model":"gpt-5-4-deployment","mode":"flag"}]',
            ),
        ).toEqual([
            { provider: 'azure', model: 'gpt-5-4-deployment', mode: 'flag' },
        ]);
    });
    it('rejects malformed approval config instead of silently enabling writes', () => {
        expect(() => parseAutopilotValidatedModels('{')).toThrow(
            'MANAGED_AGENT_VALIDATED_MODELS',
        );
        expect(() =>
            parseAutopilotValidatedModels(
                '[{"provider":"openai","model":"a","mode":"all"}]',
            ),
        ).toThrow();
    });
});
