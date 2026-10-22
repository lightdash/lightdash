import {
    OrganizationAccessStatus,
    ProjectType,
    type Project,
} from '@lightdash/common';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useOrganizationAccess } from '../../hooks/organization/useOrganizationAccess';
import { useProject } from '../../hooks/useProject';
import { useImpersonation } from '../../hooks/user/useImpersonation';
import useApp from '../../providers/App/useApp';
import { isPlaygroundProvisioningSource } from '../../utils/playgroundProject';
import { NavBarBanner } from './NavBarBanner';
import { isWarehouseQueryPage } from './sharedSignInListenerDecision';
import {
    setWarehouseSignInBannerVisibility,
    useWarehouseSignInBanner,
} from './warehouseSignInBannerState';

const useCurrentWarehouseSignInBanner = (
    activeProjectUuid: string | undefined,
    canShow: boolean,
) => {
    const warehouseBanner = useWarehouseSignInBanner();
    const { user } = useApp();
    const { pathname } = useLocation();
    const showWarehouseBanner =
        !!warehouseBanner &&
        warehouseBanner.projectUuid === activeProjectUuid &&
        warehouseBanner.userUuid === user.data?.userUuid &&
        isWarehouseQueryPage(pathname);

    const visible = canShow && showWarehouseBanner;
    useEffect(() => {
        setWarehouseSignInBannerVisibility(visible);
        return () => setWarehouseSignInBannerVisibility(false);
    }, [visible]);
    return showWarehouseBanner ? warehouseBanner : null;
};

export const useNavBarBanner = (
    project: Project | undefined,
    activeProjectUuid: string | undefined,
) => {
    const isCurrentProjectPreview = project?.type === ProjectType.PREVIEW;
    const isCurrentProjectPlayground = isPlaygroundProvisioningSource(
        project?.provisioningSource,
    );
    const upstreamProjectUuid = isCurrentProjectPreview
        ? project?.upstreamProjectUuid
        : undefined;
    const { data: upstreamProject } = useProject(upstreamProjectUuid);
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

    const higherPriorityBanner =
        isImpersonating ||
        (isCurrentProjectPreview && !isTrainingCopy) ||
        showTrialWarning;
    const warehouseBanner = useCurrentWarehouseSignInBanner(
        activeProjectUuid,
        !higherPriorityBanner,
    );
    const showWarehouseBanner = !!warehouseBanner;

    const hasBanner = higherPriorityBanner || showWarehouseBanner;
    const banner = (
        <NavBarBanner
            isImpersonating={isImpersonating}
            showPreview={isCurrentProjectPreview && !isTrainingCopy}
            project={project}
            upstreamProject={upstreamProject}
            showTrialWarning={showTrialWarning}
            organizationAccess={organizationAccess}
            warehouseBanner={warehouseBanner}
        />
    );
    return { hasBanner, banner };
};
