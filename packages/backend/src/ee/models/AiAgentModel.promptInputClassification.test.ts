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
});
