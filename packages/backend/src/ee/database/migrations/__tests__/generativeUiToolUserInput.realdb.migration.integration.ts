import { DbtVersionOptionLatest, ProjectType } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { OrganizationTableName } from '../../../../database/entities/organizations';
import { ProjectTableName } from '../../../../database/entities/projects';
import { UserTableName } from '../../../../database/entities/users';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../../utils/EncryptionUtil/EncryptionUtil';
import { AiAgentModel } from '../../../models/AiAgentModel';
import { AiAgentService } from '../../../services/AiAgentService/AiAgentService';
import {
    AiAgentToolResultTableName,
    AiPromptTableName,
    AiSqlApprovalTableName,
    AiToolUserInputTableName,
} from '../../entities/ai';
import { AiAgentTableName } from '../../entities/aiAgent';

type Fixture = {
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
    agentUuid: string;
};

describe('generative UI tool user input on the real schema', () => {
    let migrated: MigratedDatabase;
    let model: AiAgentModel;
    let fixture: Fixture;

    const createThreadWithPrompt = async () =>
        model.createWebAppThreadWithPrompt({
            thread: {
                organizationUuid: fixture.organizationUuid,
                projectUuid: fixture.projectUuid,
                userUuid: fixture.userUuid,
                createdFrom: 'web_app',
                agentUuid: fixture.agentUuid,
            },
            prompt: {
                createdByUserUuid: fixture.userUuid,
                prompt: 'Ask me which region to analyse',
            },
        });

    const createGenerateUiCall = async (promptUuid: string) => {
        const toolCallId = `call_${randomUUID()}`;
        await model.createToolCall({
            promptUuid,
            toolCallId,
            toolName: 'generateUi',
            toolArgs: { title: 'Pick a region' },
            parentToolCallId: null,
        });
        return toolCallId;
    };

    const respond = async (promptUuid: string) => {
        await model.updateModelResponse({
            promptUuid,
            response: 'Waiting for your input',
        });
    };

    const findPrompt = (promptUuid: string) =>
        migrated
            .database(AiPromptTableName)
            .where('ai_prompt_uuid', promptUuid)
            .first('response', 'responded_at', 'error_message', 'retried_at');

    const countUserInput = async (toolCallId: string) =>
        (
            await migrated
                .database(AiToolUserInputTableName)
                .where('tool_call_id', toolCallId)
                .select('tool_call_id')
        ).length;

    const record = (promptUuid: string, toolCallId: string) =>
        model.recordToolUserInputForResume({
            promptUuid,
            toolCallId,
            toolName: 'generateUi',
            input: { region: 'EMEA' },
            userUuid: fixture.userUuid,
        });

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        const { database } = migrated;
        model = new AiAgentModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });

        const [organization] = await database(OrganizationTableName)
            .insert({ organization_name: 'Generative UI org' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database(UserTableName)
            .insert({
                first_name: 'Gen',
                last_name: 'Ui',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning('user_uuid');
        const [project] = await database(ProjectTableName)
            .insert({
                name: 'Generative UI project',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DbtVersionOptionLatest.LATEST,
                created_by_user_uuid: user.user_uuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning('project_uuid');
        const [agent] = await database(AiAgentTableName)
            .insert({
                name: 'Generative UI agent',
                slug: 'generative-ui-agent',
                project_uuid: project.project_uuid,
                organization_uuid: organization.organization_uuid,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: true,
                enable_self_improvement: false,
                enable_content_tools: false,
                enable_user_context: false,
                enable_sql_mode: true,
                admin_only: false,
                model_config: null,
                is_system: false,
                version: 1,
                thread_retention_hours: null,
            })
            .returning('ai_agent_uuid');
        fixture = {
            organizationUuid: organization.organization_uuid,
            projectUuid: project.project_uuid,
            userUuid: user.user_uuid,
            agentUuid: agent.ai_agent_uuid,
        };
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('replays recorded user input as an approved call awaiting its result', async () => {
        const { promptUuid } = await createThreadWithPrompt();
        const answered = await createGenerateUiCall(promptUuid);
        const unanswered = await createGenerateUiCall(promptUuid);
        await migrated.database(AiToolUserInputTableName).insert({
            tool_call_id: answered,
            tool_name: 'generateUi',
            input: { region: 'EMEA' },
            user_uuid: fixture.userUuid,
        });

        const rows = await model.getToolCallsAndResultsForPrompt(promptUuid);

        expect(rows.map(({ toolCall }) => toolCall.toolCallId)).toEqual([
            answered,
        ]);
        expect(rows).not.toContainEqual(
            expect.objectContaining({
                toolCall: expect.objectContaining({ toolCallId: unanswered }),
            }),
        );
        expect(rows[0]).toMatchObject({
            approvalDecision: 'approved',
            toolResult: null,
        });
        expect(AiAgentService.hasUnresolvedSqlApproval(rows)).toBe(true);

        const messages = AiAgentService.buildToolCallTurnMessages(rows, true);
        expect(messages.at(-1)).toEqual({
            role: 'tool',
            content: [
                expect.objectContaining({
                    type: 'tool-approval-response',
                    approved: true,
                }),
            ],
        });
        await expect(model.findToolUserInput(answered)).resolves.toEqual({
            toolName: 'generateUi',
            input: { region: 'EMEA' },
        });
        await expect(model.findToolCallContext(answered)).resolves.toEqual(
            expect.objectContaining({
                promptUuid,
                agentUuid: fixture.agentUuid,
                toolName: 'generateUi',
                hasResult: false,
            }),
        );
    });

    test('records input once and reopens the latest answered prompt', async () => {
        const { promptUuid } = await createThreadWithPrompt();
        const toolCallId = await createGenerateUiCall(promptUuid);
        await respond(promptUuid);

        await expect(record(promptUuid, toolCallId)).resolves.toBe('recorded');

        const reopened = await findPrompt(promptUuid);
        expect(reopened).toMatchObject({
            response: null,
            responded_at: null,
            error_message: null,
        });
        expect(reopened?.retried_at).toBeInstanceOf(Date);
        await expect(countUserInput(toolCallId)).resolves.toBe(1);

        await expect(record(promptUuid, toolCallId)).resolves.toBe('duplicate');
        await expect(findPrompt(promptUuid)).resolves.toEqual(reopened);
        await expect(model.findToolUserInput(toolCallId)).resolves.toEqual({
            toolName: 'generateUi',
            input: { region: 'EMEA' },
        });
    });

    test('rolls back input for a prompt that has not finished its run', async () => {
        const { promptUuid } = await createThreadWithPrompt();
        const toolCallId = await createGenerateUiCall(promptUuid);

        await expect(record(promptUuid, toolCallId)).resolves.toBe(
            'not_resumable',
        );
        await expect(countUserInput(toolCallId)).resolves.toBe(0);
    });

    test('rolls back input for a prompt that is no longer the latest', async () => {
        const { threadUuid, promptUuid } = await createThreadWithPrompt();
        const toolCallId = await createGenerateUiCall(promptUuid);
        await respond(promptUuid);
        await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: fixture.userUuid,
            prompt: 'Never mind, something else',
        });

        await expect(record(promptUuid, toolCallId)).resolves.toBe(
            'not_resumable',
        );
        await expect(countUserInput(toolCallId)).resolves.toBe(0);
        await expect(findPrompt(promptUuid)).resolves.toMatchObject({
            response: 'Waiting for your input',
            retried_at: null,
        });
    });

    test('rolls back input for a tool call that already has a result', async () => {
        const { promptUuid } = await createThreadWithPrompt();
        const toolCallId = await createGenerateUiCall(promptUuid);
        await model.createToolResults([
            {
                promptUuid,
                toolCallId,
                toolName: 'generateUi',
                result: 'Already answered',
            },
        ]);
        await respond(promptUuid);

        await expect(record(promptUuid, toolCallId)).resolves.toBe(
            'not_resumable',
        );
        await expect(countUserInput(toolCallId)).resolves.toBe(0);
    });

    test('deleting the thread removes tool user input and SQL approvals', async () => {
        const { threadUuid, promptUuid } = await createThreadWithPrompt();
        const generateUiCall = await createGenerateUiCall(promptUuid);
        const runSqlCall = `call_${randomUUID()}`;
        await model.createToolCall({
            promptUuid,
            toolCallId: runSqlCall,
            toolName: 'runSql',
            toolArgs: { sql: 'select 1' },
            parentToolCallId: null,
        });
        await migrated.database(AiSqlApprovalTableName).insert({
            tool_call_id: runSqlCall,
            decision: 'approved',
            decided_by_user_uuid: fixture.userUuid,
        });
        await respond(promptUuid);
        await expect(record(promptUuid, generateUiCall)).resolves.toBe(
            'recorded',
        );

        await expect(
            model.deleteThread({
                organizationUuid: fixture.organizationUuid,
                threadUuid,
            }),
        ).resolves.toEqual({ deletedMemoriesCount: 0 });

        await expect(countUserInput(generateUiCall)).resolves.toBe(0);
        await expect(
            migrated
                .database(AiSqlApprovalTableName)
                .where('tool_call_id', runSqlCall)
                .select('tool_call_id'),
        ).resolves.toEqual([]);
        await expect(
            migrated
                .database(AiAgentToolResultTableName)
                .where('ai_prompt_uuid', promptUuid)
                .select('tool_call_id'),
        ).resolves.toEqual([]);
    });
});
