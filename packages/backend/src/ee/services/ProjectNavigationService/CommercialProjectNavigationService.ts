import { subject } from '@casl/ability';
import { type ProjectSummary, type SessionUser } from '@lightdash/common';
import {
    ProjectNavigationService,
    type ProjectNavigationServiceArguments,
} from '../../../services/ProjectNavigationService/ProjectNavigationService';
import type { AiAgentService } from '../AiAgentService/AiAgentService';
import type { AiOrganizationSettingsService } from '../AiOrganizationSettingsService';

type CommercialProjectNavigationServiceArguments =
    ProjectNavigationServiceArguments & {
        aiOrganizationSettingsService: Pick<
            AiOrganizationSettingsService,
            'areAiAgentsVisible'
        >;
        aiAgentService: Pick<AiAgentService, 'listAgents'>;
    };

export class CommercialProjectNavigationService extends ProjectNavigationService {
    private readonly aiOrganizationSettingsService: CommercialProjectNavigationServiceArguments['aiOrganizationSettingsService'];

    private readonly aiAgentService: CommercialProjectNavigationServiceArguments['aiAgentService'];

    constructor({
        aiOrganizationSettingsService,
        aiAgentService,
        ...args
    }: CommercialProjectNavigationServiceArguments) {
        super(args);
        this.aiOrganizationSettingsService = aiOrganizationSettingsService;
        this.aiAgentService = aiAgentService;
    }

    // Viewers see Ask AI once an agent they can access exists; managers always do.
    protected override async isAskAiVisible(
        user: SessionUser,
        project: ProjectSummary,
    ): Promise<boolean> {
        const ability = this.createAuditedAbility(user);
        const agentSubject = subject('AiAgent', {
            organizationUuid: project.organizationUuid,
            projectUuid: project.projectUuid,
        });
        if (ability.cannot('view', agentSubject)) return false;
        if (
            !(await this.aiOrganizationSettingsService.areAiAgentsVisible(user))
        )
            return false;
        if (ability.can('manage', agentSubject)) return true;
        const agents = await this.aiAgentService.listAgents(
            user,
            project.projectUuid,
        );
        return agents.length > 0;
    }
}
