import { type DbAppActivityRow } from '../../../database/entities/apps';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const BASE_ROW = {
    app_id: 'app-1',
    app_name: 'Revenue',
    app_deleted_at: null,
    version: 1,
    status: 'ready',
    prompt: 'Build a revenue app',
    created_at: new Date('2026-08-17T12:00:00Z'),
    created_by_user_uuid: 'user-1',
    created_by_user_first_name: 'Ada',
    created_by_user_last_name: 'Lovelace',
    project_uuid: 'project-1',
    project_name: 'Analytics',
} as const;

const mapActivity = (row: DbAppActivityRow) =>
    // eslint-disable-next-line @typescript-eslint/dot-notation
    AppGenerateService['toActivityEvent'](row);

describe('AppGenerateService data app activity mapping', () => {
    it('reports Codex model and unknown cost without a Claude model', () => {
        const event = mapActivity({
            ...BASE_ROW,
            resources: { codexModel: 'gpt-5.6-terra' } as never,
            generation_usage: {
                inputTokens: 100,
                outputTokens: 20,
                cacheReadInputTokens: 50,
                cacheCreationInputTokens: 0,
                numTurns: 2,
                durationApiMs: 0,
                costUsd: 0,
            },
        });

        expect(event).toMatchObject({
            codingAgent: 'codex',
            codingAgentModel: 'gpt-5.6-terra',
            usage: { costUsd: null },
        });
        expect(event).not.toHaveProperty('claudeModel');
    });

    it('preserves the legacy Claude model and its estimated cost', () => {
        const event = mapActivity({
            ...BASE_ROW,
            resources: null,
            generation_usage: {
                inputTokens: 100,
                outputTokens: 20,
                cacheReadInputTokens: 50,
                cacheCreationInputTokens: 0,
                numTurns: 2,
                durationApiMs: 10,
                costUsd: 0.12,
            },
        });

        expect(event).toMatchObject({
            codingAgent: 'claude',
            codingAgentModel: 'sonnet',
            claudeModel: 'sonnet',
            usage: { costUsd: 0.12 },
        });
    });
});
