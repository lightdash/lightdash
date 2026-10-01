import {
    isAiBillableFeature,
    isAiUsageChannel,
    type AiBillableFeature,
    type AiCreditDailyUsageSeries,
    type AiCreditUsageBreakdown,
    type AiUsageChannel,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    IconApi,
    IconAppWindow,
    IconBook2,
    IconBrandSlack,
    IconBrowser,
    IconCalendarStats,
    IconCrop,
    IconListDetails,
    IconMessageCircleStar,
    IconPlugConnected,
    IconTelescope,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentIcon } from '../aiCopilot/components/AiAgentIcon';
import classes from './AiCreditsUsageBreakdown.module.css';

// The same icons these features and channels use elsewhere in the app.
const FEATURE_ICONS: Record<Exclude<AiBillableFeature, 'agent'>, Icon> = {
    'agent-subtask': IconListDetails,
    compaction: IconCrop,
    'deep-research': IconTelescope,
    'data-app': IconAppWindow,
};

const CHANNEL_ICONS: Record<AiUsageChannel, Icon> = {
    web: IconMessageCircleStar,
    slack: IconBrandSlack,
    embed: IconBrowser,
    api: IconApi,
    mcp: IconPlugConnected,
    evals: IconBook2,
    scheduler: IconCalendarStats,
    data_app: IconAppWindow,
};

const ICON_SIZE = 14;

const findTablerIcon = (
    breakdown: AiCreditUsageBreakdown,
    key: string,
): Icon | null => {
    if (breakdown === 'feature' && isAiBillableFeature(key) && key !== 'agent')
        return FEATURE_ICONS[key];
    if (breakdown === 'channel' && isAiUsageChannel(key))
        return CHANNEL_ICONS[key];
    return null;
};

/** A feature or channel icon in the series colour, so rows still read as the chart legend; a dot otherwise. */
export const AiCreditSeriesIcon: FC<{
    breakdown: AiCreditUsageBreakdown;
    series: AiCreditDailyUsageSeries;
    color: string;
}> = ({ breakdown, series, color }) => {
    if (series.type === 'value') {
        // Ask AI keeps its own orb, as in the navbar.
        if (breakdown === 'feature' && series.key === 'agent') {
            return <AiAgentIcon size={ICON_SIZE} />;
        }
        const icon = findTablerIcon(breakdown, series.key);
        if (icon !== null) {
            return <MantineIcon icon={icon} size={ICON_SIZE} color={color} />;
        }
    }
    return <Box className={classes.dot} bg={color} />;
};
