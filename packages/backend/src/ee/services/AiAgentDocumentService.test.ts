import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type LightdashConfig } from '../../config/parseConfig';
import { type AiAgentDocumentModel } from '../models/AiAgentDocumentModel';
import { type OrgAiCopilotConfigResolver } from './ai/OrgAiCopilotConfigResolver';
import { AiAgentDocumentService } from './AiAgentDocumentService';
import { type AiAgentService } from './AiAgentService/AiAgentService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';
const agentUuid = 'agent-uuid';
const userUuid = 'user-uuid';

const projectAdmin = {
    userId: 1,
    userUuid,
    organizationUuid,
    abilityRules: [],
    ability: defineUserAbility(
        { userUuid, role: OrganizationMemberRole.MEMBER, organizationUuid },
        [
            {
                projectUuid,
                role: ProjectMemberRole.ADMIN,
                userUuid,
                roleUuid: undefined,
            },
        ],
    ),
} as unknown as SessionUser;

const organizationAdmin = {
    userId: 2,
    userUuid,
    organizationUuid,
    abilityRules: [],
    ability: defineUserAbility(
        { userUuid, role: OrganizationMemberRole.ADMIN, organizationUuid },
        [],
    ),
} as unknown as SessionUser;

const PAST_THE_CHECK = 'past the training-copy check';
const REFUSED_ADD =
    'Knowledge documents cannot be added in the training project';
const REFUSED_EDIT =
    'Knowledge documents cannot be edited in the training project';

const setup = ({
    isTrainingProject,
    syncEnabled = false,
    gitBacked = false,
}: {
    isTrainingProject: boolean;
    syncEnabled?: boolean;
    gitBacked?: boolean;
}) => {
    const aiAgentDocumentModel = {
        isTrainingProject: vi.fn().mockResolvedValue(isTrainingProject),
        // The first thing a create does once it is past the check
        getOrganizationContentSize: vi
            .fn()
            .mockRejectedValue(new Error(PAST_THE_CHECK)),
        findAccessibleForAgent: vi.fn().mockResolvedValue({
            uuid: 'document-uuid',
            name: 'Glossary',
            projectUuid,
        }),
        updateAlwaysIncludeInContext: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const contentAsCodeSnapshotModel = {
        get: vi
            .fn()
            .mockResolvedValue(
                gitBacked ? { snapshot: {}, snapshotHash: 'h' } : undefined,
            ),
    };
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        getAgent: vi
            .fn()
            .mockResolvedValue({ uuid: agentUuid, projectUuid, tags: null }),
        getAvailableExplores: vi.fn().mockResolvedValue([]),
    };
    const service = new AiAgentDocumentService({
        analytics: { track: vi.fn() } as unknown as LightdashAnalytics,
        aiAgentDocumentModel:
            aiAgentDocumentModel as unknown as AiAgentDocumentModel,
        aiAgentService: aiAgentService as unknown as AiAgentService,
        lightdashConfig: {} as LightdashConfig,
        orgAiCopilotConfigResolver: {} as OrgAiCopilotConfigResolver,
        contentAsCodeProjectSettingsModel: {
            get: vi.fn().mockResolvedValue({ syncEnabled }),
        } as never,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as never,
        aiAgentModel: {
            findAgentsForCode: vi
                .fn()
                .mockResolvedValue([
                    { uuid: agentUuid, slug: 'glossary-agent' },
                ]),
        } as never,
    });
    return {
        service,
        aiAgentDocumentModel,
        aiAgentService,
        contentAsCodeSnapshotModel,
    };
};

const upload = {
    name: 'Glossary',
    content: 'Terms',
    mimeType: 'text/markdown',
    originalFilename: 'glossary.md',
};

describe('AiAgentDocumentService in a Learn training project or copy', () => {
    it('refuses adding a document through the agent route', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: true,
        });
        await expect(
            service.createDocument(
                projectAdmin,
                { projectUuid, agentUuid },
                upload as never,
            ),
        ).rejects.toThrow(new ForbiddenError(REFUSED_ADD));
        expect(aiAgentDocumentModel.isTrainingProject).toHaveBeenCalledWith(
            projectUuid,
        );
        expect(
            aiAgentDocumentModel.getOrganizationContentSize,
        ).not.toHaveBeenCalled();
    });

    it('refuses adding a document through the organization route', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: true,
        });
        await expect(
            service.createOrganizationDocument(projectAdmin, {
                ...upload,
                projectUuid,
            } as never),
        ).rejects.toThrow(new ForbiddenError(REFUSED_ADD));
        expect(aiAgentDocumentModel.isTrainingProject).toHaveBeenCalledWith(
            projectUuid,
        );
        expect(
            aiAgentDocumentModel.getOrganizationContentSize,
        ).not.toHaveBeenCalled();
    });

    it('does not ask about training for an organization document with no project', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: true,
        });
        await expect(
            service.createOrganizationDocument(organizationAdmin, {
                ...upload,
                projectUuid: null,
            } as never),
        ).rejects.toThrow(PAST_THE_CHECK);
        expect(aiAgentDocumentModel.isTrainingProject).not.toHaveBeenCalled();
    });

    it('refuses rewriting a document', async () => {
        const { service, aiAgentService, aiAgentDocumentModel } = setup({
            isTrainingProject: true,
        });
        await expect(
            service.updateDocumentContent(
                projectAdmin,
                { projectUuid, agentUuid },
                'document-uuid',
                { name: 'Glossary', content: 'More terms' } as never,
            ),
        ).rejects.toThrow(new ForbiddenError(REFUSED_EDIT));
        expect(aiAgentDocumentModel.isTrainingProject).toHaveBeenCalledWith(
            projectUuid,
        );
        expect(aiAgentService.getAgent).not.toHaveBeenCalled();
    });

    it('rejects an empty or over-long name before spending a summary', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: false,
        });
        await expect(
            service.createDocument(projectAdmin, { projectUuid, agentUuid }, {
                ...upload,
                name: '   ',
            } as never),
        ).rejects.toThrow('Document name cannot be empty');
        await expect(
            service.createDocument(projectAdmin, { projectUuid, agentUuid }, {
                ...upload,
                name: 'n'.repeat(256),
            } as never),
        ).rejects.toThrow('Document name cannot exceed 255 characters');
        expect(
            aiAgentDocumentModel.getOrganizationContentSize,
        ).not.toHaveBeenCalled();
    });

    it('lets a real project add documents', async () => {
        const { service } = setup({ isTrainingProject: false });
        await expect(
            service.createDocument(
                projectAdmin,
                { projectUuid, agentUuid },
                upload as never,
            ),
        ).rejects.toThrow(PAST_THE_CHECK);
    });
});

describe('AiAgentDocumentService with a document the repo last applied', () => {
    const MANAGED =
        'This knowledge document is managed by Content as Code and can only be changed from the repository.';

    it('refuses toggling or deleting it from the UI once the project syncs with the repo', async () => {
        const { service, aiAgentDocumentModel, contentAsCodeSnapshotModel } =
            setup({
                isTrainingProject: false,
                syncEnabled: true,
                gitBacked: true,
            });
        await expect(
            service.updateDocument(
                projectAdmin,
                { projectUuid, agentUuid },
                'document-uuid',
                { alwaysIncludeInContext: true },
            ),
        ).rejects.toThrow(
            new ForbiddenError(MANAGED, { contentAsCodeManaged: true }),
        );
        await expect(
            service.deleteDocument(
                projectAdmin,
                { projectUuid, agentUuid },
                'document-uuid',
            ),
        ).rejects.toThrow(
            new ForbiddenError(MANAGED, { contentAsCodeManaged: true }),
        );
        expect(contentAsCodeSnapshotModel.get).toHaveBeenCalledWith(
            projectUuid,
            'ai_agent_knowledge_document',
            'glossary-agent/Glossary',
        );
        expect(
            aiAgentDocumentModel.updateAlwaysIncludeInContext,
        ).not.toHaveBeenCalled();
        expect(aiAgentDocumentModel.delete).not.toHaveBeenCalled();
    });

    it('refuses an organization admin too: the repo is the only writer', async () => {
        const { service } = setup({
            isTrainingProject: false,
            syncEnabled: true,
            gitBacked: true,
        });
        await expect(
            service.deleteDocument(
                organizationAdmin,
                { projectUuid, agentUuid },
                'document-uuid',
            ),
        ).rejects.toThrow(
            new ForbiddenError(MANAGED, { contentAsCodeManaged: true }),
        );
    });

    it('accepts the content-as-code upload as the writer', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: false,
            syncEnabled: true,
            gitBacked: true,
        });
        await service.updateDocument(
            projectAdmin,
            { projectUuid, agentUuid },
            'document-uuid',
            { alwaysIncludeInContext: true },
            'repo',
        );
        expect(
            aiAgentDocumentModel.updateAlwaysIncludeInContext,
        ).toHaveBeenCalledOnce();
    });

    it('stays editable while the project is not syncing with the repo', async () => {
        const { service, aiAgentDocumentModel, contentAsCodeSnapshotModel } =
            setup({
                isTrainingProject: false,
                syncEnabled: false,
                gitBacked: true,
            });
        await service.deleteDocument(
            projectAdmin,
            { projectUuid, agentUuid },
            'document-uuid',
        );
        expect(contentAsCodeSnapshotModel.get).not.toHaveBeenCalled();
        expect(aiAgentDocumentModel.delete).toHaveBeenCalledOnce();
    });

    it('stays editable when nobody uploaded it, even under sync', async () => {
        const { service, aiAgentDocumentModel } = setup({
            isTrainingProject: false,
            syncEnabled: true,
            gitBacked: false,
        });
        await service.deleteDocument(
            projectAdmin,
            { projectUuid, agentUuid },
            'document-uuid',
        );
        expect(aiAgentDocumentModel.delete).toHaveBeenCalledOnce();
    });
});
