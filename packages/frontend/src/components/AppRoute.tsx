import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useIsCopilotEnabled } from '../ee/features/aiCopilot/hooks/useIsCopilotEnabled';
import { useHomepageBuilderFlag } from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { health } = useApp();
    const location = useLocation();
    const orgRequest = useOrganization();
    const homepageBuilderFlag = useHomepageBuilderFlag();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const { isCopilotEnabled, isLoading: isCopilotLoading } =
        useIsCopilotEnabled();

    if (health.isInitialLoading || orgRequest.isInitialLoading) {
        return <PageSpinner />;
    }

    if (orgRequest.error || health.error) {
        return (
            <ErrorState
                error={orgRequest.error?.error || health.error?.error}
            />
        );
    }

    if (orgRequest?.data?.needsProject) {
        if (
            homepageBuilderFlag.isLoading ||
            orgSetupPageFlag.isLoading ||
            isCopilotLoading
        ) {
            return <PageSpinner />;
        }
        const showGetStarted =
            homepageBuilderFlag.isEnabled &&
            isCopilotEnabled &&
            (orgSetupPageFlag.data?.enabled ?? false);
        return (
            <Navigate
                to={{
                    pathname: showGetStarted
                        ? '/get-started'
                        : '/createProject',
                }}
                state={{ from: location }}
            />
        );
    }

    return <>{children}</>;
};

export default AppRoute;
