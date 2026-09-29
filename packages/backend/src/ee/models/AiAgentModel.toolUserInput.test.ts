import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { AiAgentModel } from './AiAgentModel';

describe('AiAgentModel tool user input', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiAgentModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: new EncryptionUtil({
            lightdashConfig: {
                lightdashSecret: 'test-secret',
                lightdashSecrets: {
                    active: 'test-secret',
                    fallbacks: [],
                    all: ['test-secret'],
                },
            },
        }),
    });
    let tracker: Tracker;

    const record = () =>
        model.recordToolUserInputForResume({
            promptUuid: 'prompt-1',
            toolCallId: 'tool-call-1',
            toolName: 'generateUi',
            input: { status: 'dismissed', state: {} },
            userUuid: 'user-1',
        });

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('recordToolUserInputForResume', () => {
        it('records the input and reopens the prompt in one transaction', async () => {
            tracker.on
                .insert('ai_tool_user_input')
                .response([{ tool_call_id: 'tool-call-1' }]);
            tracker.on
                .update('ai_prompt')
                .response([{ ai_prompt_uuid: 'prompt-1' }]);

            expect(await record()).toBe('recorded');

            const [insert] = tracker.history.insert;
            expect(insert.sql).toContain(
                'on conflict ("tool_call_id") do nothing',
            );
            const [update] = tracker.history.update;
            expect(update.sql).toContain('"response" = $');
            expect(update.sql).toContain('"responded_at" = NULL');
            expect(update.sql).toContain('"token_usage" = $');
            expect(update.sql).toContain(
                '"ai_prompt"."responded_at" is not null',
            );
            expect(update.sql).toContain(
                'later_prompt.ai_thread_uuid = ai_prompt.ai_thread_uuid',
            );
            expect(update.sql).toContain(
                'later_prompt.created_at > ai_prompt.created_at',
            );
            expect(update.sql).toContain('from "ai_agent_tool_result"');
            expect(update.bindings).toContain('tool-call-1');
            expect(
                tracker.history.transactions.map(({ state }) => state),
            ).toEqual(['committed']);
        });

        it('leaves the prompt alone when the input was already recorded', async () => {
            tracker.on.insert('ai_tool_user_input').response([]);

            expect(await record()).toBe('duplicate');
            expect(tracker.history.update).toHaveLength(0);
            expect(
                tracker.history.transactions.map(({ state }) => state),
            ).toEqual(['rolled back']);
        });

        it('rolls the input back when the prompt cannot resume', async () => {
            tracker.on
                .insert('ai_tool_user_input')
                .response([{ tool_call_id: 'tool-call-1' }]);
            tracker.on.update('ai_prompt').response([]);

            expect(await record()).toBe('not_resumable');
            expect(
                tracker.history.transactions.map(({ state }) => state),
            ).toEqual(['rolled back']);
        });
    });

    it('reads the recorded input by tool call id', async () => {
        tracker.on
            .select('ai_tool_user_input')
            .response([
                { tool_name: 'generateUi', input: { status: 'dismissed' } },
            ]);

        expect(await model.findToolUserInput('tool-call-1')).toEqual({
            toolName: 'generateUi',
            input: { status: 'dismissed' },
        });
    });

    it('replays a tool call with recorded input as an approved call', async () => {
        tracker.on.select('ai_agent_tool_call').response([]);

        await model.getToolCallsAndResultsForPrompt('prompt-1');

        const [select] = tracker.history.select;
        expect(select.sql).toContain(
            `COALESCE(ai_sql_approval.decision, CASE WHEN ai_tool_user_input.tool_call_id IS NOT NULL THEN 'approved' END) as approval_decision`,
        );
        expect(select.sql).toContain(
            'left join "ai_tool_user_input" on "ai_agent_tool_call"."tool_call_id" = "ai_tool_user_input"."tool_call_id"',
        );
    });

    it('deletes tool user input with its thread', async () => {
        tracker.on
            .select('ai_thread')
            .response([{ ai_thread_uuid: 'thread-1' }]);
        tracker.on.delete(() => true).response(0);

        await model.deleteThread({
            organizationUuid: 'org-1',
            threadUuid: 'thread-1',
        });

        expect(
            tracker.history.delete.some(({ sql }) =>
                sql.startsWith('delete from "ai_tool_user_input"'),
            ),
        ).toBe(true);
    });
});
