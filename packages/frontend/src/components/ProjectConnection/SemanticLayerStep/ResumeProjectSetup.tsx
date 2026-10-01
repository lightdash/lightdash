import { subject } from '@casl/ability';
import { FeatureFlags, ProjectSetupStepName } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { useProjectSetup } from '../../../hooks/useProjectSetup';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import PageSpinner from '../../PageSpinner';

export const ResumeProjectSetup: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const { user } = useApp();
    const canUpdateProject =
        user.data?.ability.can(
            'update',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;
    const isEnabled =
        connectJourneyFlag.data?.enabled === true && canUpdateProject;
    const setup = useProjectSetup(projectUuid, {
        enabled: isEnabled,
        poll: false,
    });

    if (connectJourneyFlag.isLoading || (isEnabled && setup.isInitialLoading)) {
        return <PageSpinner />;
    }
    if (setup.data?.resumeStep === ProjectSetupStepName.SEMANTIC_LAYER) {
        return (
            <Navigate
                to={`/projects/${projectUuid}/setup/semantic-layer`}
                replace
            />
        );
    }
    return <>{children}</>;
};
