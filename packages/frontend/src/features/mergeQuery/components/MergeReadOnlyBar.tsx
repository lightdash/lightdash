import { Group, Paper, Text } from '@mantine/core';
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
        effectiveParts,
        labelFor,
        exploreALabel,
        exploreBLabel,
        isIncomplete,
    } = useMergeSetup();

    if (!merge?.isMerging || !merge.readOnly || isIncomplete) return null;

    const keys = effectiveParts
        .map((part) => (part.fieldA ? labelFor(part.fieldA) : '?'))
        .join(' + ');
    const runError = merge.mergeResults?.results.error ?? null;

    return (
        <Paper withBorder radius="md" px="sm" py={6}>
            <Group gap="xs" wrap="nowrap">
                <MantineIcon icon={IconArrowMerge} color="ldGray.6" />
                <Text size="xs" c="dimmed" truncate>
                    {exploreALabel} merged with {exploreBLabel}, joined on{' '}
                    <Text span size="xs" fw={600} c="dark">
                        {keys}
                    </Text>
                </Text>
                {runError && (
                    <Text size="xs" c="orange.8" truncate>
                        {runError.error?.message ?? 'The merge failed to run'}
                    </Text>
                )}
            </Group>
        </Paper>
    );
};
