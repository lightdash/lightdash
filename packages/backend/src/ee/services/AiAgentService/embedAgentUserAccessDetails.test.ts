import { Ability } from '@casl/ability';
import {
    type AiAgent,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import { type FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const ORGANIZATION_UUID = 'organization-1';
const PROJECT_UUID = 'project-1';
const AGENT_UUID = 'agent-1';
const SPACE_UUID = 'space-1';

const embedWriteUser = {
    userUuid: 'embed-write-user-1',
    organizationUuid: ORGANIZATION_UUID,
    ability: new Ability([
        { action: 'view', subject: 'Project' },
        { action: 'view', subject: 'AiAgent' },
    ]),
} as unknown as SessionUser;

const embedAccount = {
    authentication: {
        type: 'jwt',
        data: {
            user: { externalId: 'external-embed-viewer' },
            content: { type: 'aiAgent', agentUuid: AGENT_UUID },
            writeActions: { spaceUuid: SPACE_UUID },
        },
    },
    user: { type: 'anonymous', externalId: 'external-embed-viewer' },
    embed: { projectUuid: PROJECT_UUID },
    embedWriteUser,
    embedWriteContext: { canUseAiAgent: true },
    access: { controls: { userAttributes: {} } },
} as unknown as AnonymousAccount;

// What a logged-in org member sees on the agent: the users with access,
// named. Embedded viewers are external and must not see these names.
const agent = {
    uuid: AGENT_UUID,
    name: 'Agent',
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: ['user-1'],
    userAccessDetails: [
        {
            userUuid: 'user-1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
        },
    ],
    spaceAccess: [SPACE_UUID],
    adminOnly: false,
} as unknown as AiAgent;

const buildService = () => {
    const service = new AiAgentService({
        aiAgentModel: {},
        analytics: { track: vi.fn() },
        featureFlagService: {
            get: vi.fn<FeatureFlagService['get']>(async () => ({
                id: 'ai-copilot',
                enabled: true,
            })),
        },
        schedulerClient: {},
        aiOrganizationSettingsService: {},
        groupsModel: { findUserInGroups: vi.fn(async () => []) },
        lightdashConfig: { ai: { copilot: {} } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getAgent').mockResolvedValue(agent);
    vi.spyOn(service, 'listAgents').mockResolvedValue([agent]);
    return service;
};

describe('AiAgentService embed agent responses', () => {
    it('does not expose the names of users with access on agent details', async () => {
        const service = buildService();

        const result = await service.getEmbedAgentDetails(
            embedAccount,
            PROJECT_UUID,
            AGENT_UUID,
        );

        expect(result.userAccessDetails).toEqual([]);
        expect(result.uuid).toBe(AGENT_UUID);
    });

    it('does not expose the names of users with access on the agent list', async () => {
        const service = buildService();

        const [result] = await service.listEmbedAgents(
            embedAccount,
            PROJECT_UUID,
        );

        expect(result.userAccessDetails).toEqual([]);
        expect(result.uuid).toBe(AGENT_UUID);
    });
});
