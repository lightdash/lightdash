import { FeatureFlags, getTimezoneLabel } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    // Backwards-compat fallback: before `EnableTimezoneSupport`, the only
    // timezone signal was the user override on the query. Remove this prop
    // once that flag graduates and `resolvedTimezone` is always populated.
    metricQueryTimezone: string | null | undefined;
};

const VisualizationTimezone: FC<Props> = ({
    resolvedTimezone,
    metricQueryTimezone,
}) => {
    const { data: enableUserTimezonesFlag } = useServerFeatureFlag(
        FeatureFlags.EnableUserTimezones,
    );
    const userTimeZonesEnabled = enableUserTimezonesFlag?.enabled ?? false;
    const timezone =
        resolvedTimezone ?? (userTimeZonesEnabled ? metricQueryTimezone : null);
    if (!timezone) return null;

    return (
        <Tooltip
            label={`Chart and results shown in ${timezone} time zone`}
            position="bottom"
        >
            <Badge
                leftSection={<MantineIcon icon={IconClock} size="sm" />}
                color="ldGray.6"
                variant="transparent"
                size="sm"
                tt="none"
            >
                {getTimezoneLabel(timezone)}
            </Badge>
        </Tooltip>
    );
};

export default VisualizationTimezone;
