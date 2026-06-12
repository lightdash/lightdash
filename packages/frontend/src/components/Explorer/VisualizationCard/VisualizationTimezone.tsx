import {
    FeatureFlags,
    getTimezoneLabel,
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    // The saved chart's single `timezone` setting, used to explain where the
    // resolved zone came from (project default / per-viewer / override).
    timezoneSetting: string | null | undefined;
};

const getSourceLabel = (
    timezoneSetting: string | null | undefined,
    resolvedTimezone: string,
): string => {
    if (timezoneSetting === USER_TIMEZONE_SETTING) {
        return `This chart follows each viewer's own time zone. You're seeing it in ${resolvedTimezone}.`;
    }
    if (
        timezoneSetting &&
        timezoneSetting !== PROJECT_TIMEZONE_SETTING &&
        isTimeZone(timezoneSetting)
    ) {
        return `This chart is pinned to ${resolvedTimezone} and won't follow the project time zone.`;
    }
    return `This chart resolves in the project time zone (${resolvedTimezone}).`;
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
            label={getSourceLabel(timezoneSetting, timezone)}
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
