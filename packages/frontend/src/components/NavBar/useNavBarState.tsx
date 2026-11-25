import { subject } from '@casl/ability';
import { OrganizationAccessStatus, ProjectType } from '@lightdash/common';
import { type ReactNode } from 'react';
import { useDraftCheckoutView } from '../../features/semanticStudio/useSemanticLayerModel';
import { useOrganizationAccess } from '../../hooks/organization/useOrganizationAccess';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useImpersonation } from '../../hooks/user/useImpersonation';
import useApp from '../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../utils/playgroundProject';
import { getProjectUrlIdentifier } from '../../utils/projectUrl';
import { ImpersonationBanner } from './ImpersonationBanner';
import { PreviewBanner } from './PreviewBanner';
import { SampleDataBanner } from './SampleDataBanner';
import { TrialWarningBanner } from './TrialWarningBanner';
import { type UpstreamProject } from './useBackToUpstreamProject';

type PreviewNotice = {
    previewName: string;
    expiresAt: Date | null;
    upstreamProject: UpstreamProject | null;
};

type NavBarState = {
    activeProjectUuid: string | undefined;
    projectUrlIdentifier: string | undefined;
    isLoadingActiveProject: boolean;
    hasBanner: boolean;
    banner: ReactNode;
    /** Set when the notice on screen is the preview one, for layouts that draw it themselves. */
    previewNotice: PreviewNotice | null;
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

    const previewNotice: PreviewNotice | null =
        showPreviewBanner && !isImpersonating && project
            ? {
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
            : null;

    const banner = isImpersonating ? (
        <ImpersonationBanner />
    ) : showPreviewBanner ? (
        <PreviewBanner
            expiresAt={project?.expiresAt ?? null}
            upstreamProject={previewNotice?.upstreamProject ?? null}
        />
    ) : showSampleDataBanner ? (
        <SampleDataBanner />
    ) : (
        organizationAccess && <TrialWarningBanner access={organizationAccess} />
    );

    return {
        activeProjectUuid,
        projectUrlIdentifier: project
            ? getProjectUrlIdentifier(project)
            : activeProjectUuid,
        isLoadingActiveProject,
        hasBanner:
            isImpersonating ||
            showPreviewBanner ||
            showSampleDataBanner ||
            showTrialWarning,
        banner,
        previewNotice,
    };
};
