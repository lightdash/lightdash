import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel prompt input classification', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiAgentModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: {} as never,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('writes a verdict only while the prompt is unclassified', async () => {
        tracker.on
            .update('ai_prompt')
            .responseOnce([{ ai_prompt_uuid: 'prompt-uuid' }]);

        await expect(
            model.updatePromptNeedsUserInput({
                promptUuid: 'prompt-uuid',
                needsUserInput: true,
                metadata: {
                    gate: 'match',
                    model: 'claude-haiku-4-5',
                    durationMs: 125,
                    confidence: 0.9,
                },
            }),
        ).resolves.toBe(true);

        const statement = tracker.history.update[0];
        expect(statement.sql).toContain('"needs_user_input" is null');
        expect(statement.bindings).toEqual(
            expect.arrayContaining([
                true,
                'prompt-uuid',
                expect.objectContaining({ gate: 'match' }),
            ]),
        );
    });

    it('overwrites an existing verdict with a structured verdict', async () => {
        tracker.on
            .update('ai_prompt')
            .responseOnce([{ ai_prompt_uuid: 'prompt-uuid' }]);

        await expect(
            model.setPromptNeedsUserInput({
                promptUuid: 'prompt-uuid',
                needsUserInput: true,
                metadata: {
                    gate: 'structured',
                    reason: 'writeback_source_selection',
                },
            }),
        ).resolves.toBe(true);

        const statement = tracker.history.update[0];
        expect(statement.sql).not.toContain('"needs_user_input" is null');
        expect(statement.bindings).toEqual(
            expect.arrayContaining([
                true,
                'prompt-uuid',
                {
                    gate: 'structured',
                    reason: 'writeback_source_selection',
                },
            ]),
        );
    });

    it('stamps retry freshness while clearing a failed response', async () => {
        tracker.on
            .update('ai_prompt')
            .responseOnce([{ ai_prompt_uuid: 'prompt-uuid' }]);

        await expect(
            model.resetPromptResponseForRetry('prompt-uuid', {
                respondedAt: '2026-08-26 10:00:00+00',
                response: null,
                errorMessage: 'Previous failure',
            }),
        ).resolves.toBe(true);

        const statement = tracker.history.update[0];
        expect(statement.sql).toContain('"retried_at" = CURRENT_TIMESTAMP');
        expect(statement.sql).toContain('"responded_at" = NULL');
        expect(statement.bindings).toEqual(
            expect.arrayContaining([
                'prompt-uuid',
                '2026-08-26 10:00:00+00',
                'Previous failure',
            ]),
        );
    });

    it('allows one final response to replace intermediate text', async () => {
        tracker.on
            .update('ai_prompt')
            .responseOnce([{ ai_prompt_uuid: 'prompt-uuid' }]);
        tracker.on.update('ai_prompt').responseOnce([]);

        await expect(
            model.updateModelResponse(
                {
                    promptUuid: 'prompt-uuid',
                    response: 'First response',
                    tokenUsage: {
                        totalTokens: 20,
                        finalStepTotalTokens: 5,
                    },
                },
                { onlyIfUnfinalized: true },
            ),
        ).resolves.toBe(true);
        await expect(
            model.updateModelResponse(
                {
                    promptUuid: 'prompt-uuid',
                    response: 'Duplicate response',
                    tokenUsage: {
                        totalTokens: 20,
                        finalStepTotalTokens: 5,
                    },
                },
                { onlyIfUnfinalized: true },
            ),
        ).resolves.toBe(false);

        for (const statement of tracker.history.update) {
            expect(statement.sql).toContain('"token_usage" is null');
            expect(statement.sql).toContain('"error_message" is null');
            expect(statement.sql).not.toContain('"responded_at" is null');
            expect(statement.sql).not.toContain('"response" is null');
        }
    });

    it('blocks finalization after an existing error', async () => {
        tracker.on.update('ai_prompt').responseOnce([]);

        await expect(
            model.updateModelResponse(
                {
                    promptUuid: 'prompt-uuid',
                    response: 'Late response',
                    tokenUsage: {
                        totalTokens: 20,
                        finalStepTotalTokens: 5,
                    },
                },
                { onlyIfUnfinalized: true },
            ),
        ).resolves.toBe(false);

        expect(tracker.history.update[0].sql).toContain(
            '"error_message" is null',
        );
    });
});
