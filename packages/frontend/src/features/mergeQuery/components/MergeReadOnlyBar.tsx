import { MergeJoinType } from '@lightdash/common';
import { Box, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconArrowMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';

/**
 * One line for the saved-chart view: what this chart is merged with and on
 * what. The view opens with the sidebar closed, so without this a viewer has
 * merged numbers with nothing saying where half of them came from.
 */
export const MergeReadOnlyBar: FC = () => {
    const merge = useMergeSafe();
    const {
        relationshipSummary: keys,
        sourceLabels,
        primaryExploreLabel,
        isIncomplete,
    } = useMergeSetup();

    if (!merge?.isMerging || !merge.readOnly || isIncomplete) return null;

    const keepLabel =
        merge.joinType === MergeJoinType.LEFT
            ? `Keep ${primaryExploreLabel}`
            : merge.joinType === MergeJoinType.INNER
              ? 'Matches only'
              : 'Keep all rows';
    const runError = merge.mergeResults?.results.error ?? null;

    return (
        <Paper radius="md" px="sm" py="xs">
            <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" color="gray" radius="md" size="md">
                    <MantineIcon
                        icon={IconArrowMerge}
                        color="gray.7"
                        size={14}
                    />
                </ThemeIcon>
                <Box flex={1} miw={0}>
                    <Text
                        size="sm"
                        fw={600}
                        truncate
                        title={sourceLabels.join(' + ')}
                    >
                        {sourceLabels.join(' + ')}
                    </Text>
                    <Text size="xs" c="dimmed" truncate title={keys}>
                        Matched on{' '}
                        <Text span size="xs" fw={600} c="gray.7">
                            {keys}
                        </Text>{' '}
                        · {keepLabel}
                    </Text>
                </Box>
                {runError && (
                    <Text size="xs" c="orange.8" truncate>
                        {runError.error?.message ?? 'The merge failed to run'}
                    </Text>
                )}
            </Group>
        </Paper>
    );
};
