import { Box } from '@mantine/core';
import { IconHammer } from '@tabler/icons-react';
import { type FC } from 'react';
import { ReasoningHistoryRow } from '../../../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard';
import {
    hasVersionNarration,
    type AppVersionNarrationData,
} from '../utils/versionNarration';

type Props = {
    narration: AppVersionNarrationData;
    isLive: boolean;
    className?: string;
};

/** The shared Reasoning/Activity presentation for live and persisted builds. */
const AppVersionNarration: FC<Props> = ({ narration, isLive, className }) => {
    if (!hasVersionNarration(narration)) return null;

    return (
        <Box className={className}>
            {narration.reasoning.length > 0 && (
                <ReasoningHistoryRow
                    texts={narration.reasoning}
                    isLive={isLive}
                />
            )}
            {narration.activity.length > 0 && (
                <ReasoningHistoryRow
                    texts={narration.activity}
                    isLive={isLive}
                    icon={IconHammer}
                    label="Activity"
                />
            )}
        </Box>
    );
};

export default AppVersionNarration;
