import { FeatureFlags } from '@lightdash/common';
import { Badge, Group, Select, Stack, Text } from '@mantine/core';
import { useMemo, type FC, type ReactNode } from 'react';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import LoadingSkeleton from '../../../components/Explorer/ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useMerge, useMergeSafe } from '../context/useMerge';

/**
 * The field picker for the second query.
 *
 * The explorer's own tree, pointed at the second query's explore and its
 * selection. Picking fields is picking fields: search, grouping, descriptions
 * and field detail all work here because it is the same component, not a
 * second and worse one that has to be kept in step.
 */
const QueryBFields: FC = () => {
    const projectUuid = useProjectUuid();
    const { data: explores } = useExplores(projectUuid);
    const { queryB, setExploreB, toggleFieldB } = useMerge();
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

    return (
        <Stack gap="xs" h="100%">
            <Group gap="xs">
                <Badge color="orange" variant="light">
                    Query B
                </Badge>
                <Text size="xs" c="dimmed">
                    fields for the second query
                </Text>
            </Group>

            <Select
                placeholder="Pick a table"
                data={(explores ?? []).map((option) => ({
                    value: option.name,
                    label: option.label,
                }))}
                value={queryB.exploreName}
                onChange={setExploreB}
                searchable
            />

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

/**
 * Swaps the sidebar to the focused query's fields. Query A keeps the explorer's
 * own sidebar untouched, so nothing about the familiar path changes until a
 * second query exists.
 */
export const MergeSidebar: FC<{ fallback: ReactNode }> = ({ fallback }) => {
    const merge = useMergeSafe();
    const { data: mergeFlag } = useServerFeatureFlag(FeatureFlags.MergeQueries);

    if (
        mergeFlag?.enabled === true &&
        merge?.isMerging &&
        merge.focus === 'b'
    ) {
        return <QueryBFields />;
    }
    return <>{fallback}</>;
};
