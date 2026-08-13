import { Group, Select, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import LoadingSkeleton from '../../../components/Explorer/ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useMerge } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';
import { MergeJoinBar } from './MergeJoinBar';

/**
 * The field picker for the second query, shown when its tab has the focus.
 *
 * The explorer's own tree, pointed at the second query's explore and its
 * selection. Picking fields is picking fields: search, grouping, descriptions
 * and field detail all work here because it is the same component, not a
 * second and worse one that has to be kept in step.
 */
export const QueryBTree: FC = () => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid);
    const { queryB, setExploreB, toggleFieldB } = useMerge();
    const { setupStep } = useMergeSetup();
    const { data: explore, isInitialLoading } = useExplore(
        queryB.exploreName ?? undefined,
    );

    const selection = useMemo(
        () => ({
            activeFields: new Set([...queryB.dimensions, ...queryB.metrics]),
            selectedDimensions: queryB.dimensions,
        }),
        [queryB.dimensions, queryB.metrics],
    );
    const guidance =
        queryB.metrics.length === 0
            ? 'Add a metric to continue'
            : setupStep === 'Pick a field from each query to join on'
              ? 'Choose matching fields'
              : setupStep;

    return (
        <Stack gap="xs" h="100%">
            <Select
                placeholder="Pick a table"
                label="Table"
                size="xs"
                data={(explores ?? []).map((option) => ({
                    value: option.name,
                    label: option.label,
                }))}
                value={queryB.exploreName}
                onChange={setExploreB}
                searchable
                autoFocus={!queryB.exploreName}
            />

            {queryB.exploreName && (
                <>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Text size="xs" c="dimmed">
                            {queryB.dimensions.length + queryB.metrics.length}{' '}
                            selected · {queryB.dimensions.length} dimension
                            {queryB.dimensions.length === 1 ? '' : 's'} ·{' '}
                            {queryB.metrics.length} metric
                            {queryB.metrics.length === 1 ? '' : 's'}
                        </Text>
                        {guidance && (
                            <Text size="xs" c="blue.7" ta="right">
                                {guidance}
                            </Text>
                        )}
                    </Group>
                    <MergeJoinBar />
                </>
            )}

            {queryB.exploreName && isInitialLoading && <LoadingSkeleton />}

            {explore && (
                <ItemDetailProvider>
                    <ExploreTree
                        explore={explore}
                        selection={selection}
                        onSelectedFieldChange={toggleFieldB}
                    />
                </ItemDetailProvider>
            )}
        </Stack>
    );
};
