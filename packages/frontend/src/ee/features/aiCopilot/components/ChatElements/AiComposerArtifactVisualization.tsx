import { type ComposerVizKind, type ComposerVizPlan } from '@lightdash/common';
import { Center, Stack, Text } from '@mantine/core';
import { IconClockOff } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';
import { AiComposerChartVisualization } from './AiComposerChartVisualization';

const LOADING_MESSAGE = 'Loading composer query results...';

type ContentProps = {
    projectUuid: string;
    results: InfiniteQueryResults;
    /** How the displayed node result renders; the plan says which kinds fit. */
    kind: ComposerVizKind;
    plan: ComposerVizPlan;
    headerContent: ReactNode;
    flush?: boolean;
};

// A displayed node result: table or a chart from the same rows. Results
// expire, so a failed fetch is an empty state rather than an error card.
export const AiComposerArtifactVisualization: FC<ContentProps> = ({
    projectUuid,
    results,
    kind,
    plan,
    headerContent,
    flush = false,
}) => {
    if (results.error) {
        return (
            <Stack gap="md" h="100%" mih={300}>
                {headerContent}
                <Center flex={1}>
                    <Stack gap="xs" align="center" justify="center">
                        <MantineIcon icon={IconClockOff} color="gray" />
                        <Text size="xs" c="dimmed" ta="center">
                            These results have expired — ask the agent to re-run
                            this query
                        </Text>
                    </Stack>
                </Center>
            </Stack>
        );
    }

    const axes = kind === 'table' ? undefined : plan.axes[kind];
    if (kind !== 'table' && axes) {
        return (
            <AiComposerChartVisualization
                projectUuid={projectUuid}
                results={results}
                kind={kind}
                axes={axes}
                headerContent={headerContent}
                loadingMessage={LOADING_MESSAGE}
            />
        );
    }

    return (
        <AiArtifactTableVisualization
            results={results}
            headerContent={headerContent}
            loadingMessage={LOADING_MESSAGE}
            flush={flush}
        />
    );
};
