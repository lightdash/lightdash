import { AiAgent, SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    getServices,
    getTestContext,
    IntegrationTestContext,
} from '../../../vitest.setup.integration';

describe('AiAgentService - Project Default Agent Integration Tests', () => {
    let context: IntegrationTestContext;
    let agent1: AiAgent;
    let agent2: AiAgent;
    let agent3RestrictedToOtherUser: AiAgent;
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeAll(async () => {
        context = getTestContext();
        const services = getServices(context.app);

        // Create agent 1: Open access
        agent1 = await services.aiAgentService.createAgent(context.testUser, {
            name: 'Test Agent 1 - Open',
            description: null,
            projectUuid,
            tags: [],
            integrations: [],
            instruction: '',
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            imageUrl: null,
            enableDataAccess: false,
            enableSelfImprovement: false,
            version: 2,
        });

        // Create agent 2: Open access
        agent2 = await services.aiAgentService.createAgent(context.testUser, {
            name: 'Test Agent 2 - Open',
            description: null,
            projectUuid,
            tags: [],
            integrations: [],
            instruction: '',
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            imageUrl: null,
            enableDataAccess: false,
            enableSelfImprovement: false,
            version: 2,
        });

        // Create agent 3: Restricted to a different user
        agent3RestrictedToOtherUser = await services.aiAgentService.createAgent(
            context.testUser,
            {
                name: 'Test Agent 3 - Restricted',
                description: null,
                projectUuid,
                tags: [],
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: ['some-other-user-uuid'],
                spaceAccess: [],
                imageUrl: null,
                enableDataAccess: false,
                enableSelfImprovement: false,
                version: 2,
            },
        );
    });

    const resetDefaultPreferences = async () => {
        const services = getServices(context.app);

        await services.aiAgentService.deleteUserAgentPreferences(
            context.testUser,
            projectUuid,
        );
        await services.projectService.updateProjectDefaultAgent(
            context.testUser,
            projectUuid,
            { defaultAiAgentUuid: null },
        );
    };

    describe('getEffectiveDefaultAgentUuid', () => {
        it('returns user preference when set and accessible', async () => {
            const services = getServices(context.app);

            // Set user preference to agent2
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent2.uuid },
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent2.uuid);
        });

        it('uses project default when user preference is not set', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent1.uuid);
        });

        it('user preference takes precedence over project default when both are set', async () => {
            const services = getServices(context.app);

            // Set user preference to agent2 first
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent2.uuid },
            );

            // Set project default to agent1
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            // Even with user pref set to agent2, project default is agent1
            // This test verifies project default is readable
            const projectModel = context.app.getModels().getProjectModel();
            const projectSummary = await projectModel.getSummary(projectUuid);

            expect(projectSummary.defaultAiAgentUuid).toBe(agent1.uuid);

            // Effective default should still be user preference (agent2)
            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent2.uuid);
        });

        it('uses project default when user preference is inaccessible', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent3RestrictedToOtherUser.uuid },
            );
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent1.uuid);
        });

        it('uses first accessible agent when no defaults are configured', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            const accessibleAgents = await services.aiAgentService.listAgents(
                context.testUser,
                projectUuid,
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(accessibleAgents.length).toBeGreaterThan(0);
            expect(effectiveDefault).toBe(accessibleAgents[0].uuid);
        });

        it('uses first accessible agent when both defaults are inaccessible', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent3RestrictedToOtherUser.uuid },
            );
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent3RestrictedToOtherUser.uuid },
            );

            const accessibleAgents = await services.aiAgentService.listAgents(
                context.testUser,
                projectUuid,
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).not.toBe(agent3RestrictedToOtherUser.uuid);
            expect(effectiveDefault).toBe(accessibleAgents[0].uuid);
        });

        it('uses accessible user preference when project default is inaccessible', async () => {
            const services = getServices(context.app);

            // Set user preference to agent1 (accessible)
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent1.uuid },
            );

            // Set project default to restricted agent (not accessible to testUser)
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent3RestrictedToOtherUser.uuid },
            );

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent1.uuid);
        });

        it('can clear project default by setting to null', async () => {
            const services = getServices(context.app);

            // Set project default
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            // Clear project default
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: null },
            );

            const projectModel = context.app.getModels().getProjectModel();
            const projectSummary = await projectModel.getSummary(projectUuid);

            expect(projectSummary.defaultAiAgentUuid).toBeUndefined();
        });

        it('clears project default and falls back when project default agent is deleted', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            const tempAgent = await services.aiAgentService.createAgent(
                context.testUser,
                {
                    name: 'Temp Project Default Agent',
                    description: null,
                    projectUuid,
                    tags: [],
                    integrations: [],
                    instruction: '',
                    groupAccess: [],
                    userAccess: [],
                    spaceAccess: [],
                    imageUrl: null,
                    enableDataAccess: false,
                    enableSelfImprovement: false,
                    version: 2,
                },
            );

            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: tempAgent.uuid },
            );

            await services.aiAgentService.deleteAgent(
                context.testUser,
                tempAgent.uuid,
            );

            const projectModel = context.app.getModels().getProjectModel();
            const projectSummary = await projectModel.getSummary(projectUuid);

            expect(projectSummary.defaultAiAgentUuid).toBeUndefined();

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).not.toBe(tempAgent.uuid);
            expect([agent1.uuid, agent2.uuid]).toContain(effectiveDefault);

            const preferences =
                await services.aiAgentService.getUserAgentPreferencesWithDefaults(
                    context.testUser,
                    projectUuid,
                );

            expect(preferences.projectDefault).toBeNull();
            expect(preferences.effectiveDefault).toBe(effectiveDefault);
        });

        it('removes user preference and falls back to project default when user default agent is deleted', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            const tempAgent = await services.aiAgentService.createAgent(
                context.testUser,
                {
                    name: 'Temp User Default Agent',
                    description: null,
                    projectUuid,
                    tags: [],
                    integrations: [],
                    instruction: '',
                    groupAccess: [],
                    userAccess: [],
                    spaceAccess: [],
                    imageUrl: null,
                    enableDataAccess: false,
                    enableSelfImprovement: false,
                    version: 2,
                },
            );

            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: tempAgent.uuid },
            );

            await services.aiAgentService.deleteAgent(
                context.testUser,
                tempAgent.uuid,
            );

            const userPreferences =
                await services.aiAgentService.getUserAgentPreferences(
                    context.testUser,
                    projectUuid,
                );

            expect(userPreferences).toBeNull();

            const effectiveDefault =
                await services.aiAgentService.getEffectiveDefaultAgentUuid(
                    context.testUser,
                    projectUuid,
                );

            expect(effectiveDefault).toBe(agent1.uuid);

            const preferences =
                await services.aiAgentService.getUserAgentPreferencesWithDefaults(
                    context.testUser,
                    projectUuid,
                );

            expect(preferences.userDefault).toBeNull();
            expect(preferences.projectDefault).toBe(agent1.uuid);
            expect(preferences.effectiveDefault).toBe(agent1.uuid);
        });
    });

    describe('getUserAgentPreferencesWithDefaults', () => {
        it('returns all three layers when preferences are set', async () => {
            const services = getServices(context.app);

            // Set user default to agent1
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent1.uuid },
            );

            // Set project default to agent2
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent2.uuid },
            );

            const result =
                await services.aiAgentService.getUserAgentPreferencesWithDefaults(
                    context.testUser,
                    projectUuid,
                );

            expect(result.userDefault).toBe(agent1.uuid);
            expect(result.projectDefault).toBe(agent2.uuid);
            expect(result.effectiveDefault).toBe(agent1.uuid); // User pref wins
        });

        it('returns project default when it differs from user default', async () => {
            const services = getServices(context.app);

            // Set user default to agent2
            await services.aiAgentService.updateUserAgentPreferences(
                context.testUser,
                projectUuid,
                { defaultAgentUuid: agent2.uuid },
            );

            // Set project default to agent1
            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            const result =
                await services.aiAgentService.getUserAgentPreferencesWithDefaults(
                    context.testUser,
                    projectUuid,
                );

            expect(result.userDefault).toBe(agent2.uuid);
            expect(result.projectDefault).toBe(agent1.uuid);
            expect(result.effectiveDefault).toBe(agent2.uuid); // User pref wins
        });

        it('returns project default as effective when user preference is unset', async () => {
            const services = getServices(context.app);

            await resetDefaultPreferences();

            await services.projectService.updateProjectDefaultAgent(
                context.testUser,
                projectUuid,
                { defaultAiAgentUuid: agent1.uuid },
            );

            const result =
                await services.aiAgentService.getUserAgentPreferencesWithDefaults(
                    context.testUser,
                    projectUuid,
                );

            expect(result.userDefault).toBeNull();
            expect(result.projectDefault).toBe(agent1.uuid);
            expect(result.effectiveDefault).toBe(agent1.uuid);
        });
    });
});
