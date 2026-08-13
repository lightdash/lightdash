import { Select, Stack } from '@mantine/core';
import { useMemo, type FC } from 'react';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import LoadingSkeleton from '../../../components/Explorer/ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useMerge } from '../context/useMerge';

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
