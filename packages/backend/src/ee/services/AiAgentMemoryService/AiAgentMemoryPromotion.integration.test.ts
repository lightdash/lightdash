import {
    ConflictError,
    ParameterError,
    SEED_ORG_1,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_PROJECT,
    type AiAgentJudgeProjectContextEntry,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { vi } from 'vitest';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { parseConfig } from '../../../config/parseConfig';
import { getTestContext } from '../../../vitest.setup.integration';
import { AiOrganizationSettingsTableName } from '../../database/entities/ai';
import { AiAgentTableName } from '../../database/entities/aiAgent';
import { AiAgentMemoryTableName } from '../../database/entities/aiAgentMemory';
import { AiAgentReviewItemTableName } from '../../database/entities/aiAgentReviewClassifier';
import { AiAgentMemoryModel } from '../../models/AiAgentMemoryModel';
import { AiAgentReviewClassifierModel } from '../../models/AiAgentReviewClassifierModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { createReviewJudgeConfigResolverMock } from '../ai/reviewJudgeModel.mock';
import { type AiOrganizationSettingsService } from '../AiOrganizationSettingsService';
import { AiAgentMemoryService } from './AiAgentMemoryService';

describe('AI agent memory promotion integration', () => {
    let database: Knex;
    let memoryModel: AiAgentMemoryModel;
    let reviewModel: AiAgentReviewClassifierModel;
    let originalReviewsEnabled: boolean | null = null;
    let createdSettingsRow = false;
    let agentUuid: string;
    const memoryUuids: string[] = [];
    const fingerprints: string[] = [];

    beforeAll(async () => {
        database = getTestContext().db;
        memoryModel = getTestContext()
            .app.getModels()
            .getAiAgentMemoryModel<AiAgentMemoryModel>();
        reviewModel = getTestContext()
            .app.getModels()
            .getAiAgentReviewClassifierModel<AiAgentReviewClassifierModel>();
        const settings = await database(AiOrganizationSettingsTableName)
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .first('ai_agent_reviews_enabled');
        if (settings) {
            originalReviewsEnabled = settings.ai_agent_reviews_enabled;
            await database(AiOrganizationSettingsTableName)
                .where('organization_uuid', SEED_ORG_1.organization_uuid)
                .update({ ai_agent_reviews_enabled: true });
        } else {
            await database(AiOrganizationSettingsTableName).insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                ai_agents_visible: true,
                ai_agent_reviews_enabled: true,
            });
            createdSettingsRow = true;
        }
        const [agent] = await database(AiAgentTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                name: 'Promotion test agent',
                slug: `promotion-test-${randomUUID().slice(0, 8)}`,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: false,
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
            .returning<Array<{ ai_agent_uuid: string }>>('ai_agent_uuid');
        agentUuid = agent.ai_agent_uuid;
    });

    afterAll(async () => {
        if (agentUuid) {
            await database(AiAgentTableName)
                .where('ai_agent_uuid', agentUuid)
                .delete();
        }
        const settingsQuery = database(AiOrganizationSettingsTableName).where(
            'organization_uuid',
            SEED_ORG_1.organization_uuid,
        );
        if (createdSettingsRow) {
            await settingsQuery.delete();
        } else if (originalReviewsEnabled !== null) {
            await settingsQuery.update({
                ai_agent_reviews_enabled: originalReviewsEnabled,
            });
        }
    });

    afterEach(async () => {
        if (fingerprints.length > 0) {
            await database(AiAgentReviewItemTableName)
                .whereIn('fingerprint', fingerprints)
                .delete();
            fingerprints.length = 0;
        }
        if (memoryUuids.length > 0) {
            await database(AiAgentMemoryTableName)
                .whereIn('ai_agent_memory_uuid', memoryUuids)
                .delete();
            memoryUuids.length = 0;
        }
        await database(AiOrganizationSettingsTableName)
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .update({ ai_agent_reviews_enabled: true });
    });

    const seedMemory = async (status: 'active' | 'retired' = 'active') => {
        const slug = `promotion-${randomUUID().slice(0, 8)}`;
        const [row] = await database(AiAgentMemoryTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                agent_uuid: agentUuid,
                user_uuid: getTestContext().testUser.userUuid,
                source_thread_uuid: null,
                slug,
                title: 'Revenue convention',
                raw_memory:
                    '## Memory\nRevenue means net revenue after refunds.\n\n## Evidence\n- Query returned 12,345.67.',
                thread_summary: null,
                terms: JSON.stringify(['revenue']),
                objects: JSON.stringify([{ type: 'explore', name: 'orders' }]),
                unresolved_objects: JSON.stringify([]),
                status,
                scope: 'user',
                generated_at: new Date('2026-08-05T12:00:00Z'),
            })
            .returning<Array<{ ai_agent_memory_uuid: string }>>(
                'ai_agent_memory_uuid',
            );
        memoryUuids.push(row.ai_agent_memory_uuid);
        return row.ai_agent_memory_uuid;
    };

    const validEntry = (
        content = 'Revenue means net revenue after refunds.',
    ): AiAgentJudgeProjectContextEntry => ({
        op: 'create',
        id: null,
        kind: 'definition',
        content,
        terms: ['revenue'],
        objects: [{ type: 'explore', name: 'orders' }],
    });

    const authoredProposal = (
        content = 'Revenue means net revenue after refunds.',
    ) => ({
        type: 'proposal' as const,
        entry: {
            op: 'create' as const,
            id: null,
            kind: 'definition' as const,
            content,
        },
    });

    const buildService = (
        projectContextEntryAuthoringCall = vi
            .fn()
            .mockResolvedValue(authoredProposal()),
    ) => {
        const lightdashConfig = parseConfig();
        const { app } = getTestContext();
        const services = app.getServiceRepository();
        const service = new AiAgentMemoryService({
            analytics: new LightdashAnalytics({
                lightdashConfig,
                writeKey: 'notrack',
                dataPlaneUrl: 'notrack',
                options: { enable: false },
            }),
            aiAgentMemoryModel: memoryModel,
            aiAgentReviewClassifierModel: reviewModel,
            aiAgentModel: app.getModels().getAiAgentModel(),
            groupsModel: app.getModels().getGroupsModel(),
            projectModel: app.getModels().getProjectModel(),
            projectContextModel: app.getModels().getProjectContextModel(),
            userModel: app.getModels().getUserModel(),
            featureFlagService: services.getFeatureFlagService(),
            aiOrganizationSettingsService:
                services.getAiOrganizationSettingsService<AiOrganizationSettingsService>(),
            schedulerClient: app
                .getClients()
                .getSchedulerClient() as CommercialSchedulerClient,
            consolidationDryRun: false,
            orgAiCopilotConfigResolver: createReviewJudgeConfigResolverMock(),
            lightdashConfig,
            projectContextEntryAuthoringCall,
        });
        return { service, projectContextEntryAuthoringCall };
    };

    it('creates one board item carrying the proposed entry and memory provenance', async () => {
        const memoryUuid = await seedMemory();
        const { service } = buildService();

        const item = await service.promoteMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            memoryUuid,
            'Useful across the project',
        );
        fingerprints.push(item.fingerprint);

        expect(item).toMatchObject({
            source: 'memory',
            title: 'Revenue convention',
            description: expect.stringContaining('Useful across the project'),
            primaryRootCause: 'project_context',
            status: 'open',
            projectContextEntry: validEntry(),
            sourceMemory: {
                uuid: memoryUuid,
                slug: expect.stringMatching(/^promotion-/),
            },
            nominationReason: 'Useful across the project',
            nominator: {
                name: expect.any(String),
                email: getTestContext().testUser.email,
            },
        });
        expect(item.description).toContain(getTestContext().testUser.email);

        await expect(
            reviewModel.getReviewItem(
                SEED_ORG_1.organization_uuid,
                item.fingerprint,
            ),
        ).resolves.toMatchObject({
            projectContextEntry: validEntry(),
            sourceMemory: { uuid: memoryUuid },
            nominationReason: 'Useful across the project',
            nominator: { email: getTestContext().testUser.email },
        });

        await expect(
            database(AiAgentReviewItemTableName)
                .where('fingerprint', item.fingerprint)
                .first('nomination_reason'),
        ).resolves.toMatchObject({
            nomination_reason: 'Useful across the project',
        });

        await expect(
            service.getMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                item.sourceMemory!.slug,
            ),
        ).resolves.toMatchObject({
            promotionReviewItem: {
                uuid: item.uuid,
                status: 'open',
                blocksNewNomination: true,
            },
        });

        await database(AiAgentReviewItemTableName)
            .where('fingerprint', item.fingerprint)
            .update({
                status: 'dismissed',
                dismissed_reason: 'expected_behavior',
            });
        await expect(
            service.getMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                item.sourceMemory!.slug,
            ),
        ).resolves.toMatchObject({
            promotionReviewItem: {
                status: 'dismissed',
                blocksNewNomination: true,
            },
        });
    });

    it('creates a proposal without a nomination reason', async () => {
        const memoryUuid = await seedMemory();
        const { service, projectContextEntryAuthoringCall } = buildService();

        const item = await service.promoteMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            memoryUuid,
            undefined,
        );
        fingerprints.push(item.fingerprint);

        expect(item).toMatchObject({
            description: expect.stringMatching(/^Nominated by /),
            nominationReason: null,
        });
        expect(item.description).not.toContain('\n\n');
        expect(projectContextEntryAuthoringCall).toHaveBeenCalledWith(
            expect.objectContaining({
                nominationReason: null,
            }),
        );
        await expect(
            database(AiAgentReviewItemTableName)
                .where('fingerprint', item.fingerprint)
                .first('nomination_reason'),
        ).resolves.toEqual({ nomination_reason: null });
    });

    it('rejects a live duplicate before paying for another authoring call', async () => {
        const memoryUuid = await seedMemory();
        const { service, projectContextEntryAuthoringCall } = buildService();
        const item = await service.promoteMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            memoryUuid,
            'First nomination',
        );
        fingerprints.push(item.fingerprint);

        await expect(
            service.promoteMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                memoryUuid,
                'Duplicate nomination',
            ),
        ).rejects.toMatchObject({
            name: ConflictError.name,
            data: { fingerprint: item.fingerprint },
        });
        expect(projectContextEntryAuthoringCall).toHaveBeenCalledOnce();
    });

    it('reopens dismissals except expected behavior', async () => {
        const memoryUuid = await seedMemory();
        const { service } = buildService();
        const item = await service.promoteMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            memoryUuid,
            'First nomination',
        );
        fingerprints.push(item.fingerprint);
        await database(AiAgentReviewItemTableName)
            .where('fingerprint', item.fingerprint)
            .update({
                status: 'dismissed',
                dismissed_reason: 'not_actionable',
            });

        await expect(
            service.promoteMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                memoryUuid,
                'New evidence',
            ),
        ).resolves.toMatchObject({
            uuid: item.uuid,
            status: 'open',
            dismissedReason: null,
            description: expect.stringContaining('New evidence'),
        });

        await database(AiAgentReviewItemTableName)
            .where('fingerprint', item.fingerprint)
            .update({
                status: 'dismissed',
                dismissed_reason: 'not_actionable',
            });
        await expect(
            reviewModel.upsertMemoryReviewItem({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                memoryUuid,
                fingerprint: item.fingerprint,
                title: 'Revenue convention',
                description: `Editor nomination\n\nNominated by Editor User (${SEED_ORG_1_EDITOR_EMAIL.email})`,
                agentUuid,
                projectContextEntry: validEntry(),
                createdByUserUuid: SEED_ORG_1_EDITOR.user_uuid,
                nominationReason: 'Editor nomination',
            }),
        ).resolves.toMatchObject({
            nominationReason: 'Editor nomination',
            createdByUserUuid: SEED_ORG_1_EDITOR.user_uuid,
            nominator: {
                name: `${SEED_ORG_1_EDITOR.first_name} ${SEED_ORG_1_EDITOR.last_name}`,
                email: SEED_ORG_1_EDITOR_EMAIL.email,
            },
        });

        await database(AiAgentReviewItemTableName)
            .where('fingerprint', item.fingerprint)
            .update({
                status: 'dismissed',
                dismissed_reason: 'expected_behavior',
            });
        await expect(
            service.promoteMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                memoryUuid,
                'Try again',
            ),
        ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects inactive memories and disabled reviews before authoring', async () => {
        const retiredMemoryUuid = await seedMemory('retired');
        const activeMemoryUuid = await seedMemory();
        const { service, projectContextEntryAuthoringCall } = buildService();

        await expect(
            service.promoteMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                retiredMemoryUuid,
                'Nominate retired',
            ),
        ).rejects.toBeInstanceOf(ParameterError);

        await database(AiOrganizationSettingsTableName)
            .where('organization_uuid', SEED_ORG_1.organization_uuid)
            .update({ ai_agent_reviews_enabled: false });
        await expect(
            service.promoteMemory(
                getTestContext().testUser,
                SEED_PROJECT.project_uuid,
                activeMemoryUuid,
                'Nominate disabled',
            ),
        ).rejects.toThrow('Project context review is not enabled');
        expect(projectContextEntryAuthoringCall).not.toHaveBeenCalled();
    });

    it('returns operational authoring failures without a service retry', async () => {
        const memoryUuid = await seedMemory();
        const { service, projectContextEntryAuthoringCall } = buildService(
            vi.fn().mockRejectedValue(new Error('authoring unavailable')),
        );

        const promotion = service.promoteMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            memoryUuid,
            'Nominate unavailable output',
        );

        await expect(promotion).rejects.toMatchObject({
            message:
                "We couldn't automatically draft a project-context proposal from this memory. Try again.",
            data: { attempts: 1 },
        });
        expect(projectContextEntryAuthoringCall).toHaveBeenCalledOnce();
    });

    it('returns a conflict for concurrent first-time nominations', async () => {
        const memoryUuid = await seedMemory();
        const fingerprint = `memory:${randomUUID()}`;
        fingerprints.push(fingerprint);
        const args = {
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            memoryUuid,
            fingerprint,
            title: 'Revenue convention',
            description: 'Concurrent nomination',
            agentUuid,
            projectContextEntry: validEntry(),
            createdByUserUuid: getTestContext().testUser.userUuid,
            nominationReason: 'Concurrent nomination',
        };

        const results = await Promise.allSettled([
            reviewModel.upsertMemoryReviewItem(args),
            reviewModel.upsertMemoryReviewItem(args),
        ]);
        const fulfilled = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = results.filter(
            (result) => result.status === 'rejected',
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({
            reason: expect.any(ConflictError),
        });
        await expect(
            database(AiAgentReviewItemTableName)
                .where('source_ai_agent_memory_uuid', memoryUuid)
                .select('ai_agent_review_item_uuid'),
        ).resolves.toHaveLength(1);
    });
});
