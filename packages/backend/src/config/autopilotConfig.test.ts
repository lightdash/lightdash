import {
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
    it('rejects malformed approval config instead of silently enabling writes', () => {
        expect(() => parseAutopilotValidatedModels('{')).toThrow(
            'MANAGED_AGENT_VALIDATED_MODELS',
        );
        expect(() =>
            parseAutopilotValidatedModels(
                '[{"provider":"openai","model":"a","mode":"all"}]',
            ),
        ).toThrow();
        expect(parseAutopilotValidatedModels(undefined)).toEqual([]);
    });
});
