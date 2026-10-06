import { Ability } from '@casl/ability';
import { describe, expect, it, vi } from 'vitest';
import { logAiEgressBlock } from '../../../utils/aiEgress/logAiEgressBlock';
import { AiService } from './AiService';

vi.mock('../../../utils/aiEgress/logAiEgressBlock', () => ({
    logAiEgressBlock: vi.fn(),
}));

const user = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
    ability: new Ability([]),
    abilityRules: [],
} as never;

const buildService = (restricted: boolean) => {
    const run = vi.fn().mockResolvedValue({
        result: '{"mark":"bar"}',
        tokenUsage: undefined,
    });
    const service = new AiService({
        analytics: { track: vi.fn() } as never,
        projectService: {
            getProject: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-1' }),
            getAiAccessRestrictions: vi.fn().mockResolvedValue({
                enabled: restricted,
            }),
        } as never,
        openAi: { run, model: { modelName: 'test' } } as never,
        lightdashConfig: {} as never,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        orgAiCopilotConfigResolver: {} as never,
    });
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ cannot: () => false });
    return { service, run };
};

describe('AI custom viz restrictions', () => {
    const request = {
        user,
        projectUuid: 'project-1',
        prompt: 'Make a bar chart',
        itemsMap: {},
        sampleResults: [{ secret_value: 'private-row' }],
        currentVizConfig: '{}',
    };

    it('refuses browser rows and logs a typed block under restrictions', async () => {
        const { service, run } = buildService(true);
        await expect(service.generateCustomViz(request)).rejects.toThrow(
            'AI custom charts are off under AI access restrictions',
        );
        expect(run).not.toHaveBeenCalled();
        expect(logAiEgressBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                surface: 'browser_upload',
                reason: 'rows_not_fetched_by_ai_sign_in',
                detail: 'custom_viz_rows',
            }),
        );
    });

    it('keeps the provider payload when restrictions are off', async () => {
        const { service, run } = buildService(false);
        await expect(service.generateCustomViz(request)).resolves.toBe(
            '{"mark":"bar"}',
        );
        expect(run).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                sample_data: JSON.stringify(request.sampleResults),
            }),
        );
    });
});
