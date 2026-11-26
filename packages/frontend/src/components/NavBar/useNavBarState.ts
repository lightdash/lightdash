import { subject } from '@casl/ability';
import {
    OrganizationAccessStatus,
    ProjectType,
    type OrganizationAccess,
} from '@lightdash/common';
import { useDraftCheckoutView } from '../../features/semanticStudio/useSemanticLayerModel';
import { useOrganizationAccess } from '../../hooks/organization/useOrganizationAccess';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useImpersonation } from '../../hooks/user/useImpersonation';
import useApp from '../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../utils/playgroundProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import { type UpstreamProject } from './useBackToUpstreamProject';

/** What the workspace is, when that needs saying. At most one applies. */
export type WorkspaceNotice =
    | {
          type: 'preview';
          previewName: string;
          expiresAt: Date | null;
          upstreamProject: UpstreamProject | null;
      }
    | { type: 'sampleData' }
    | { type: 'trial'; isExpired: boolean };

type NavBarState = {
    activeProjectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
    isLoadingActiveProject: boolean;
    /** Runs alongside any notice, and outranks it where only one can show. */
    isImpersonating: boolean;
    notice: WorkspaceNotice | null;
    organizationAccess: OrganizationAccess | undefined;
};

const getWorkspaceNotice = ({
    preview,
    hasSampleData,
    trialAccess,
}: {
    preview: Extract<WorkspaceNotice, { type: 'preview' }> | null;
    hasSampleData: boolean;
    trialAccess: OrganizationAccess | null;
}): WorkspaceNotice | null => {
    if (preview) return preview;
    if (hasSampleData) return { type: 'sampleData' };
    if (trialAccess) {
        return {
            type: 'trial',
            isExpired:
                trialAccess.status === OrganizationAccessStatus.TRIAL_EXPIRED,
        };
    }
    return null;
};

export const useNavBarState = (): NavBarState => {
    const routeProjectUuid = useProjectUuid();

    const { activeProjectUuid, isLoading: isLoadingActiveProject } =
        useActiveProjectUuid({
            refetchOnMount: true,
            projectUuid: routeProjectUuid,
        });
    const { data: project } = useProject(activeProjectUuid);

    const isCurrentProjectPreview = project?.type === ProjectType.PREVIEW;
    const isCurrentProjectPlayground = isPlaygroundProvisioningSource(
        project?.provisioningSource,
    );
    const upstreamProjectUuid = isCurrentProjectPreview
        ? project?.upstreamProjectUuid
        : undefined;
    const { data: upstreamProject } = useProject(upstreamProjectUuid);
    // A learner's copy of the training project is not a preview in the
    // engineering sense: no branch, no upstream to promote to. No banner.
    const isTrainingCopy =
        isCurrentProjectPreview &&
        upstreamProject?.type === ProjectType.TRAINING;
    const { isImpersonating } = useImpersonation();
    const { data: organizationAccess } = useOrganizationAccess();

    const showTrialWarning =
        !isImpersonating &&
        !isCurrentProjectPreview &&
        !isCurrentProjectPlayground &&
        (organizationAccess?.status ===
            OrganizationAccessStatus.TRIAL_WARNING ||
            organizationAccess?.status ===
                OrganizationAccessStatus.TRIAL_EXPIRED);

    const { user } = useApp();
    const showSampleDataBanner =
        !isImpersonating &&
        isCurrentProjectPlayground &&
        user.data?.ability.can(
            'create',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                type: ProjectType.DEFAULT,
            }),
        ) === true;

    // Keeps every request reading the checked-out draft; the project switcher says so.
    useDraftCheckoutView(
        activeProjectUuid,
        project ? getProjectUrlIdentifier(project) : undefined,
    );

    const showPreviewBanner = isCurrentProjectPreview && !isTrainingCopy;

    return {
        activeProjectUuid,
        projectUrlIdentifier: project
            ? getProjectUrlIdentifier(project)
            : activeProjectUuid,
        isLoadingActiveProject,
        isImpersonating,
        organizationAccess,
        notice: getWorkspaceNotice({
            preview:
                showPreviewBanner && project
                    ? {
                          type: 'preview',
                          previewName: project.name,
                          expiresAt: project.expiresAt ?? null,
                          upstreamProject: upstreamProject
                              ? {
                                    projectUuid: upstreamProject.projectUuid,
                                    slug: upstreamProject.slug,
                                    name: upstreamProject.name,
                                }
                              : null,
                      }
                    : null,
            hasSampleData: showSampleDataBanner,
            trialAccess:
                showTrialWarning && organizationAccess
                    ? organizationAccess
                    : null,
        }),
    };
};
