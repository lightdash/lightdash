import { Center, Stack, Text } from '@mantine/core';
import { IconClockOff } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';

type ContentProps = {
    results: InfiniteQueryResults;
    headerContent: ReactNode;
};

/**
 * v0 composer artifact rendering: a table straight from the stored
 * lastQueryUuid. Results are creator-scoped and expire, so a failed fetch is
 * an intentional empty state rather than an error card.
 */
export const AiComposerArtifactVisualization: FC<ContentProps> = ({
    results,
    headerContent,
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
        <AiArtifactTableVisualization
            results={results}
            headerContent={headerContent}
            loadingMessage="Loading composer query results..."
        />
    );
};
