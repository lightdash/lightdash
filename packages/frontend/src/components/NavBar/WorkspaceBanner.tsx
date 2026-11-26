import { assertUnreachable, type OrganizationAccess } from '@lightdash/common';
import { type FC } from 'react';
import { ImpersonationBanner } from './ImpersonationBanner';
import { PreviewBanner } from './PreviewBanner';
import { SampleDataBanner } from './SampleDataBanner';
import { TrialWarningBanner } from './TrialWarningBanner';
import { type WorkspaceNotice } from './useNavBarState';

type Props = {
    isImpersonating: boolean;
    notice: WorkspaceNotice | null;
    organizationAccess: OrganizationAccess | undefined;
};

/** The strip above the top navbar; it has room for one notice at a time. */
export const WorkspaceBanner: FC<Props> = ({
    isImpersonating,
    notice,
    organizationAccess,
}) => {
    if (isImpersonating) return <ImpersonationBanner />;
    // The trial banner decides for itself whether the trial needs saying.
    const trialBanner = organizationAccess ? (
        <TrialWarningBanner access={organizationAccess} />
    ) : null;
    if (notice === null) return trialBanner;
    switch (notice.type) {
        case 'preview':
            return (
                <PreviewBanner
                    expiresAt={notice.expiresAt}
                    upstreamProject={notice.upstreamProject}
                />
            );
        case 'sampleData':
            return <SampleDataBanner />;
        case 'trial':
            return trialBanner;
        default:
            return assertUnreachable(notice, 'Unknown workspace notice');
    }
};
