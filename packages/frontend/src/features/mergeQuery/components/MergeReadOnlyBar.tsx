import { MergeJoinType } from '@lightdash/common';
import { Box, Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconArrowMerge } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { getJoinClauseLabel } from './mergeJoinLabels';

/**
 * One line for the saved-chart view: what this chart is merged with and on
 * what. The view opens with the sidebar closed, so without this a viewer has
 * merged numbers with nothing saying where half of them came from.
 */
export const MergeReadOnlyBar: FC = () => {
    const merge = useMergeSafe();
    const {
        effectiveParts,
        labelFor,
        primaryExploreLabel,
        additionalExploreLabel,
        additionalSourceId,
        isIncomplete,
    } = useMergeSetup();

    if (!merge?.isMerging || !merge.readOnly || isIncomplete) return null;

    const keys = effectiveParts
        .map((part) => {
            const primaryFieldId = part.fieldIdBySourceId[PRIMARY_SOURCE_ID];
            const additionalFieldId =
                part.fieldIdBySourceId[additionalSourceId];
            const primaryField = primaryFieldId
                ? labelFor(primaryFieldId)
                : '?';
            const additionalField = additionalFieldId
                ? labelFor(additionalFieldId)
                : '?';

            return getJoinClauseLabel(
                primaryExploreLabel ?? 'First data',
                primaryField,
                additionalExploreLabel ?? 'Combined data',
                additionalField,
            );
        })
        .join(' AND ');
    const keepLabel =
        merge.joinType === MergeJoinType.LEFT
            ? `Keep ${primaryExploreLabel}`
            : merge.joinType === MergeJoinType.INNER
              ? 'Matches only'
              : 'Keep all rows';
    const runError = merge.mergeResults?.results.error ?? null;

    return (
        <Paper withBorder radius="md" px="sm" py="xs">
            <Group gap="sm" wrap="nowrap">
                <ThemeIcon variant="light" color="gray" radius="md" size="md">
                    <MantineIcon
                        icon={IconArrowMerge}
                        color="blue.7"
                        size={14}
                    />
                </ThemeIcon>
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        <Box
                            w={7}
                            h={7}
                            bg="blue.6"
                            style={{ borderRadius: '50%', flexShrink: 0 }}
                        />
                        <Text size="sm" fw={600} truncate>
                            {primaryExploreLabel}
                        </Text>
                        <Text size="xs" c="dimmed">
                            +
                        </Text>
                        <Box
                            w={7}
                            h={7}
                            bg="orange.6"
                            style={{ borderRadius: '50%', flexShrink: 0 }}
                        />
                        <Text size="sm" fw={600} truncate>
                            {additionalExploreLabel}
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
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
