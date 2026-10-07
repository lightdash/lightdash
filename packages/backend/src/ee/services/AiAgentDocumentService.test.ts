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

const setup = ({ isTrainingProject }: { isTrainingProject: boolean }) => {
    const aiAgentDocumentModel = {
        isTrainingProject: vi.fn().mockResolvedValue(isTrainingProject),
        // The first thing a create does once it is past the check
        getOrganizationContentSize: vi
            .fn()
            .mockRejectedValue(new Error(PAST_THE_CHECK)),
    };
    const aiAgentService = {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        getAgent: vi
            .fn()
            .mockResolvedValue({ uuid: agentUuid, projectUuid, tags: null }),
        getAvailableExplores: vi.fn().mockResolvedValue([]),
    };
    const service = new AiAgentDocumentService({
        analytics: {} as LightdashAnalytics,
        aiAgentDocumentModel:
            aiAgentDocumentModel as unknown as AiAgentDocumentModel,
        aiAgentService: aiAgentService as unknown as AiAgentService,
        lightdashConfig: {} as LightdashConfig,
        orgAiCopilotConfigResolver: {} as OrgAiCopilotConfigResolver,
    });
    return { service, aiAgentDocumentModel, aiAgentService };
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
