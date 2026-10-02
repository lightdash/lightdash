import { FeatureFlags } from '@lightdash/common';
import { Badge } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { isPlaygroundProvisioningSource } from '../../utils/playgroundProject';

export const SampleDataBadge: FC<{
    provisioningSource: string | null | undefined;
}> = ({ provisioningSource }) => {
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    if (
        connectJourneyFlag.data?.enabled !== true ||
        !isPlaygroundProvisioningSource(provisioningSource)
    ) {
        return null;
    }
    return (
        <Badge size="xs" flex="none">
            Sample data
        </Badge>
    );
};
