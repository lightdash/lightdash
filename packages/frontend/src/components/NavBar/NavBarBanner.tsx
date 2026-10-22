import type { Project } from '@lightdash/common';
import type { useOrganizationAccess } from '../../hooks/organization/useOrganizationAccess';
import { ImpersonationBanner } from './ImpersonationBanner';
import { PreviewBanner } from './PreviewBanner';
import { TrialWarningBanner } from './TrialWarningBanner';
import { WarehouseSignInBanner } from './WarehouseSignInBanner';
import type { useWarehouseSignInBanner } from './warehouseSignInBannerState';

export const NavBarBanner = ({
    isImpersonating,
    showPreview,
    project,
    upstreamProject,
    showTrialWarning,
    organizationAccess,
    warehouseBanner,
}: {
    isImpersonating: boolean;
    showPreview: boolean;
    project: Project | undefined;
    upstreamProject: Project | undefined;
    showTrialWarning: boolean;
    organizationAccess: ReturnType<typeof useOrganizationAccess>['data'];
    warehouseBanner: ReturnType<typeof useWarehouseSignInBanner>;
}) =>
    isImpersonating ? (
        <ImpersonationBanner />
    ) : showPreview ? (
        <PreviewBanner
            expiresAt={project?.expiresAt ?? null}
            upstreamProject={
                upstreamProject
                    ? {
                          projectUuid: upstreamProject.projectUuid,
                          slug: upstreamProject.slug,
                          name: upstreamProject.name,
                      }
                    : null
            }
        />
    ) : showTrialWarning && organizationAccess ? (
        <TrialWarningBanner access={organizationAccess} />
    ) : warehouseBanner ? (
        <WarehouseSignInBanner
            status={warehouseBanner.status}
            userUuid={warehouseBanner.userUuid}
            reconnect={warehouseBanner.reconnect}
        />
    ) : null;
