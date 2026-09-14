import { ForbiddenError, type SessionUser } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

const ORGANIZATION_UUID = 'org-uuid';
const OTHER_ORGANIZATION_UUID = 'other-org-uuid';
const PROJECT_UUID = 'project-uuid';
const FOREIGN_PROJECT_UUID = 'foreign-project-uuid';
const USER_UUID = 'user-uuid';

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Org',
} as unknown as SessionUser;

const buildService = () => {
    const aiAgentModel = {
        listMcpServers: vi.fn().mockResolvedValue([]),
    };
    const projectModel = {
        getSummary: vi.fn().mockImplementation((projectUuid: string) =>
            Promise.resolve({
                organizationUuid:
                    projectUuid === FOREIGN_PROJECT_UUID
                        ? OTHER_ORGANIZATION_UUID
                        : ORGANIZATION_UUID,
                name: 'Project',
            }),
        ),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        projectModel,
        featureFlagService,
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // Mimic the real ability layer: the user can only manage AiAgent
    // subjects within their own organization.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({
        cannot: (_action: string, subj: { organizationUuid?: string }) =>
            subj.organizationUuid !== ORGANIZATION_UUID,
        can: () => true,
    });
    return { service, aiAgentModel };
};

describe('MCP server management authorization', () => {
    it('allows managing MCP servers on a project in the user organization', async () => {
        const { service, aiAgentModel } = buildService();

        await service.listMcpServers(user, PROJECT_UUID);

        expect(aiAgentModel.listMcpServers).toHaveBeenCalledWith(
            PROJECT_UUID,
            USER_UUID,
        );
    });

    it('rejects managing MCP servers on a project from another organization', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.listMcpServers(user, FOREIGN_PROJECT_UUID),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(aiAgentModel.listMcpServers).not.toHaveBeenCalled();
    });
});
