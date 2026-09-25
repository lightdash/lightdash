import { type ComposerVizKind, type ComposerVizPlan } from '@lightdash/common';
import { Center, Stack, Text } from '@mantine/core';
import { IconClockOff } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiVizSwitchedResult } from './AiVizSwitchedResult';

const LOADING_MESSAGE = 'Loading composer query results...';

type ContentProps = {
    projectUuid: string;
    results: InfiniteQueryResults;
    plan: ComposerVizPlan;
    kind: ComposerVizKind;
    onKindChange: (kind: ComposerVizKind) => void;
    headerContent: ReactNode;
    flush?: boolean;
};

// A displayed node result with its viz switcher. Results expire, so a failed
// fetch is an empty state rather than an error card.
export const AiComposerArtifactVisualization: FC<ContentProps> = ({
    projectUuid,
    results,
    plan,
    kind,
    onKindChange,
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

    return (
        <AiVizSwitchedResult
            projectUuid={projectUuid}
            results={results}
            plan={plan}
            kind={kind}
            onKindChange={onKindChange}
            headerContent={headerContent}
            loadingMessage={LOADING_MESSAGE}
            flush={flush}
        />
    );
};
