import { type AiBillableFeature } from '@lightdash/common';
import {
    IconAppWindow,
    IconCrop,
    IconListDetails,
    IconTelescope,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentIcon } from '../aiCopilot/components/AiAgentIcon';

// The same icons these features use elsewhere in the app.
const FEATURE_ICONS: Record<Exclude<AiBillableFeature, 'agent'>, Icon> = {
    'agent-subtask': IconListDetails,
    compaction: IconCrop,
    'deep-research': IconTelescope,
    'data-app': IconAppWindow,
};

const ICON_SIZE = 14;

/** The feature's icon in its series colour, so the legend reads like the chart. */
export const AiCreditSeriesIcon: FC<{
    feature: AiBillableFeature;
    color: string;
}> = ({ feature, color }) =>
    // Ask AI keeps its own orb, as in the navbar.
    feature === 'agent' ? (
        <AiAgentIcon size={ICON_SIZE} />
    ) : (
        <MantineIcon
            icon={FEATURE_ICONS[feature]}
            size={ICON_SIZE}
            color={color}
        />
    );
