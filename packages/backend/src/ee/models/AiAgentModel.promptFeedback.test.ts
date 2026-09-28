import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel prompt feedback', () => {
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

    it('can record a downvote without overwriting feedback from an earlier modal submission', async () => {
        tracker.on.update('ai_prompt').response(1);

        await model.updateHumanScore({
            promptUuid: 'prompt-uuid',
            humanScore: -1,
            humanFeedback: 'The result is incorrect',
        });
        await model.updateHumanScore({
            promptUuid: 'prompt-uuid',
            humanScore: -1,
            preserveHumanFeedback: true,
        });

        expect(tracker.history.update[0].bindings).toContain(
            'The result is incorrect',
        );
        const delayedVote = tracker.history.update[1];
        expect(delayedVote.sql).not.toContain('"human_feedback"');
        expect(delayedVote.bindings).toEqual([-1, 'prompt-uuid']);
    });
    it.each([
        {
            humanScore: -1,
            humanFeedback: undefined,
            preserveHumanFeedback: false,
        },
        {
            humanScore: -1,
            humanFeedback: undefined,
            preserveHumanFeedback: undefined,
        },
        {
            humanScore: 1,
            humanFeedback: undefined,
            preserveHumanFeedback: true,
        },
    ])(
        'still clears feedback for $humanScore with preserveHumanFeedback=$preserveHumanFeedback',
        async (data) => {
            tracker.on.update('ai_prompt').response(1);

            await model.updateHumanScore({
                promptUuid: 'prompt-uuid',
                ...data,
            });

            expect(tracker.history.update[0].sql).toContain('"human_feedback"');
            expect(tracker.history.update[0].bindings).toEqual([
                data.humanScore,
                null,
                'prompt-uuid',
            ]);
        },
    );
});
