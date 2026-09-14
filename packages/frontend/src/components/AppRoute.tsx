import { subject } from '@casl/ability';
import {
    FeatureFlags,
    type Organization,
    ProjectType,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, type FC } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useHomepageBuilderFlag } from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import ErrorState from './common/ErrorState';
import PageSpinner from './PageSpinner';

const AppRoute: FC<React.PropsWithChildren> = ({ children }) => {
    const { health, user } = useApp();
    const location = useLocation();
    const queryClient = useQueryClient();

    const mustConfirmNoProjectRef = useRef<boolean | undefined>(undefined);
    if (mustConfirmNoProjectRef.current === undefined) {
        mustConfirmNoProjectRef.current =
            queryClient.getQueryData<Organization>(['organization'])
                ?.needsProject === true;
    }

    const orgRequest = useOrganization(
        mustConfirmNoProjectRef.current
            ? { refetchOnMount: 'always' }
            : undefined,
    );
    const homepageBuilderFlag = useHomepageBuilderFlag();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);

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
            user.isInitialLoading
        ) {
            return <PageSpinner />;
        }

        const canCreateProject =
            user.data?.ability.can(
                'create',
                subject('Project', {
                    organizationUuid: user.data.organizationUuid,
                    type: ProjectType.DEFAULT,
                }),
            ) ?? false;

        if (canCreateProject) {
            const isNewOnboardingEnabled =
                orgSetupPageFlag.data?.enabled ?? false;
            const showGetStarted =
                homepageBuilderFlag.isEnabled && isNewOnboardingEnabled;
            const pathname = showGetStarted
                ? '/get-started'
                : isNewOnboardingEnabled
                  ? '/onboarding/data-source'
                  : '/createProject';
            return <Navigate to={{ pathname }} state={{ from: location }} />;
        }
    }

    return <>{children}</>;
};

export default AppRoute;
