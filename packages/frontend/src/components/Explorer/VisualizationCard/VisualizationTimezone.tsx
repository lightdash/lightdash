import { FeatureFlags, getTimezoneLabel, isTimeZone } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { getTimezoneSourceLabel } from '../../../utils/timezoneSourceLabel';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    // The saved chart's single `timezone` setting, used to explain where the
    // resolved zone came from (project default / per-viewer / override).
    timezoneSetting: string | null | undefined;
};

const VisualizationTimezone: FC<Props> = ({
    resolvedTimezone,
    timezoneSetting,
}) => {
    const { data: enableUserTimezonesFlag } = useServerFeatureFlag(
        FeatureFlags.EnableUserTimezones,
    );
    const userTimeZonesEnabled = enableUserTimezonesFlag?.enabled ?? false;
    // Backwards-compat fallback: before `EnableTimezoneSupport`, the only
    // timezone signal is an explicit override zone on the query.
    const overrideFallback =
        timezoneSetting && isTimeZone(timezoneSetting) ? timezoneSetting : null;
    const timezone =
        resolvedTimezone ?? (userTimeZonesEnabled ? overrideFallback : null);
    if (!timezone) return null;

    return (
        <Tooltip
            label={getTimezoneSourceLabel(timezoneSetting, timezone)}
            position="bottom"
            multiline
            w={260}
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
