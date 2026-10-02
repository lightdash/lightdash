import { type OrganizationAccess } from '@lightdash/common';
import { type ComponentProps } from 'react';
import { ImpersonationBanner } from './ImpersonationBanner';
import { PreviewBanner } from './PreviewBanner';
import { TrialWarningBanner } from './TrialWarningBanner';
import { WarehouseSignInBanner } from './WarehouseSignInBanner';

type Props = {
    isImpersonating: boolean;
    preview: ComponentProps<typeof PreviewBanner> | null;
    trialAccess: OrganizationAccess | null;
    warehouseSignIn: ComponentProps<typeof WarehouseSignInBanner> | null;
};

export const NavBarBanner = ({
    isImpersonating,
    preview,
    trialAccess,
    warehouseSignIn,
}: Props) => {
    if (isImpersonating) return <ImpersonationBanner />;
    if (preview) return <PreviewBanner {...preview} />;
    if (trialAccess) return <TrialWarningBanner access={trialAccess} />;
    if (warehouseSignIn) return <WarehouseSignInBanner {...warehouseSignIn} />;
    return null;
};
