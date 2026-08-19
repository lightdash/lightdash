import { describe, expect, it } from 'vitest';
import {
    toAppClarifyParams,
    toAppGeneratePayload,
    type AppBuildRequest,
} from './appBuildRequest';

const request = (
    overrides: Partial<AppBuildRequest> = {},
): AppBuildRequest => ({
    prompt: 'a dashboard that shows performance',
    template: 'dashboard',
    fileIds: ['file-1'],
    appUuid: 'app-1',
    charts: [{ uuid: 'chart-1', includeSampleData: true, linkLive: false }],
    dashboard: { uuid: 'dashboard-1', includeSampleData: false },
    externalConnections: [
        { externalConnectionUuid: 'conn-1', alias: 'warehouse' },
    ],
    spaceUuid: 'space-1',
    modelRequest: { claudeModel: 'sonnet' },
    designUuid: 'design-1',
    ...overrides,
});

describe('toAppGeneratePayload', () => {
    it('carries every snapshotted field onto the generate call', () => {
        expect(toAppGeneratePayload('project-1', request(), [])).toEqual({
            projectUuid: 'project-1',
            prompt: 'a dashboard that shows performance',
            template: 'dashboard',
            creationExperience: 'app_builder',
            fileIds: ['file-1'],
            appUuid: 'app-1',
            charts: [
                { uuid: 'chart-1', includeSampleData: true, linkLive: false },
            ],
            dashboard: { uuid: 'dashboard-1', includeSampleData: false },
            externalConnections: [
                { externalConnectionUuid: 'conn-1', alias: 'warehouse' },
            ],
            clarifications: undefined,
            spaceUuid: 'space-1',
            claudeModel: 'sonnet',
            designUuid: 'design-1',
        });
    });

    it('sends answers when the round produced any', () => {
        const clarifications = [{ question: 'Over time?', answer: 'monthly' }];

        expect(
            toAppGeneratePayload('project-1', request(), clarifications)
                .clarifications,
        ).toEqual(clarifications);
    });

    it('carries a snapshotted Codex model onto the generate call', () => {
        expect(
            toAppGeneratePayload(
                'project-1',
                request({ modelRequest: { codexModel: 'gpt-5.6-terra' } }),
                [],
            ),
        ).toMatchObject({ codexModel: 'gpt-5.6-terra' });
    });

    it('omits an empty round rather than sending an empty array', () => {
        expect(
            toAppGeneratePayload('project-1', request(), []).clarifications,
        ).toBeUndefined();
    });

    it('keeps an explicit opt-out of a theme distinct from no choice', () => {
        expect(
            toAppGeneratePayload('project-1', request({ designUuid: null }), [])
                .designUuid,
        ).toBeNull();
    });
});

describe('toAppClarifyParams', () => {
    it('asks the clarifier about the prompt and its attachments', () => {
        expect(toAppClarifyParams(request())).toEqual({
            prompt: 'a dashboard that shows performance',
            template: 'dashboard',
            charts: [
                { uuid: 'chart-1', includeSampleData: true, linkLive: false },
            ],
            dashboard: { uuid: 'dashboard-1', includeSampleData: false },
            fileIds: ['file-1'],
        });
    });

    it('never leaks build-only choices into the clarify request', () => {
        const params = toAppClarifyParams(request());

        expect(params).not.toHaveProperty('claudeModel');
        expect(params).not.toHaveProperty('codexModel');
        expect(params).not.toHaveProperty('modelRequest');
        expect(params).not.toHaveProperty('designUuid');
        expect(params).not.toHaveProperty('spaceUuid');
        expect(params).not.toHaveProperty('appUuid');
    });
});
