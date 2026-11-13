import { Box, Button, Tooltip } from '@mantine/core';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import { useDefaultAiAgent } from '../../ee/features/aiCopilot/components/Launcher/useDefaultAiAgent';
import {
    openDefaultAgentPanel,
    resetActivePanel,
} from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../ee/features/aiCopilot/store/hooks';

const AiAgentsLauncher = lazy(() =>
    import('../../ee/features/aiCopilot/components/Launcher/AiAgentsLauncher').then(
        (module) => ({ default: module.AiAgentsLauncher }),
    ),
);

export const AnalyticsAskAiButton = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const { selectedAgent, isResolving } = useDefaultAiAgent(projectUuid);
    const [hasOpened, setHasOpened] = useState(false);
    useEffect(() => {
        if (!hasOpened) return;
        return () => {
            dispatch(resetActivePanel());
        };
    }, [hasOpened, projectUuid, dispatch]);
    const unavailableReason = isResolving
        ? 'Preparing the analytics agent…'
        : 'The analytics agent is not available yet.';

    return (
        <>
            <Tooltip label={unavailableReason} disabled={!!selectedAgent}>
                <Box component="span">
                    <Button
                        variant="default"
                        size="xs"
                        leftSection={<AiAgentIcon size={14} />}
                        disabled={!selectedAgent}
                        loading={isResolving}
                        onClick={() => {
                            dispatch(openDefaultAgentPanel({}));
                            setHasOpened(true);
                        }}
                    >
                        Ask AI
                    </Button>
                </Box>
            </Tooltip>
            {hasOpened && (
                <Suspense fallback={null}>
                    <AiAgentsLauncher
                        projectUuid={projectUuid}
                        forceVisible
                        isAnalyticsHomepage={false}
                    />
                </Suspense>
            )}
        </>
    );
};
