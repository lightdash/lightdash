import { FeatureFlags } from '@lightdash/common';
import { type FC, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import PageSpinner from '../../PageSpinner';

export const SemanticLayerStepRedirect: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const { activeProjectUuid, isLoading } = useActiveProjectUuid();
    const isEnabled = connectJourneyFlag.data?.enabled === true;

    if (connectJourneyFlag.isLoading || (isEnabled && isLoading)) {
        return <PageSpinner />;
    }
    if (isEnabled && activeProjectUuid) {
        return (
            <Navigate
                to={`/projects/${activeProjectUuid}/setup/semantic-layer`}
                replace
            />
        );
    }
    return <>{children}</>;
};
