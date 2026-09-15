import {
    FeatureFlags,
    isTimeZone,
    PROJECT_TIMEZONE_SETTING,
    USER_TIMEZONE_SETTING,
} from '@lightdash/common';
import { ActionIcon, Popover, Text } from '@mantine/core';
import { IconWorld } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { getTimezoneSourceLabel } from '../../utils/timezoneSourceLabel';
import MantineIcon from '../common/MantineIcon';

type Props = {
    resolvedTimezone: string | null | undefined;
    // The chart's single `timezone` setting, used to explain where the resolved
    // zone came from (per-viewer / pinned override).
    timezoneSetting: string | null | undefined;
};

const TileTimezoneInfo: FC<Props> = ({ resolvedTimezone, timezoneSetting }) => {
    const getUiString = useUiStrings();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const timezoneSupportEnabled = timezoneSupportFlag?.enabled ?? false;

    // Only surface the indicator when the chart opts out of the project default:
    // either following each viewer's own zone or pinned to a specific zone.
    const isUserTimezone = timezoneSetting === USER_TIMEZONE_SETTING;
    const pinnedZone =
        timezoneSetting &&
        timezoneSetting !== PROJECT_TIMEZONE_SETTING &&
        isTimeZone(timezoneSetting)
            ? timezoneSetting
            : null;
    const timezone = resolvedTimezone ?? pinnedZone;

    if (
        !timezoneSupportEnabled ||
        (!isUserTimezone && !pinnedZone) ||
        !timezone
    ) {
        return null;
    }

    return (
        <Popover withArrow position="bottom-end" offset={4} arrowOffset={10}>
            <Popover.Dropdown
                maw="calc(100vw - 24px)"
                mah="calc(100dvh - 24px)"
                style={{ overflowY: 'auto' }}
            >
                <Text size="sm" c="ldGray.7" maw={260}>
                    {getTimezoneSourceLabel(timezoneSetting, timezone)}
                </Text>
            </Popover.Dropdown>
            <Popover.Target>
                <ActionIcon
                    aria-label={getUiString('tileMenu.timezone')}
                    size="sm"
                >
                    <MantineIcon icon={IconWorld} />
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};

export default TileTimezoneInfo;
