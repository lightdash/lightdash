import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import BasePanel from '../../../components/Explorer/ExploreSideBar/BasePanel';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import LoadingSkeleton from '../../../components/Explorer/ExploreTree/LoadingSkeleton';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useMerge } from '../context/useMerge';
import { useMergeSetup } from '../hooks/useMergeSetup';

/**
 * The field picker for the second query, shown when its tab has the focus.
 *
 * The explorer's own tree, pointed at the second query's explore and its
 * selection. Picking fields is picking fields: search, grouping, descriptions
 * and field detail all work here because it is the same component, not a
 * second and worse one that has to be kept in step.
 */
export const QueryBTree: FC = () => {
    const { queryB, setExploreB, toggleFieldB } = useMerge();
    const { setupStep } = useMergeSetup();
    const [isChoosingExplore, setIsChoosingExplore] = useState(
        !queryB.exploreName,
    );
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

    useEffect(() => {
        if (!queryB.exploreName) setIsChoosingExplore(true);
    }, [queryB.exploreName]);

    if (isChoosingExplore) {
        return (
            <Box h="100%" mih={0} style={{ overflow: 'hidden' }}>
                <BasePanel
                    onExploreClick={(selectedExplore) => {
                        setExploreB(selectedExplore.name);
                        setIsChoosingExplore(false);
                    }}
                />
            </Box>
        );
    }

    return (
        <Stack gap="xs" h="100%" mih={0}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Box miw={0}>
                    <Text size="xs" c="dimmed">
                        Table
                    </Text>
                    <Text size="sm" fw={600} truncate>
                        {explore?.label ?? queryB.exploreName}
                    </Text>
                </Box>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => setIsChoosingExplore(true)}
                >
                    Change
                </Button>
            </Group>

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
                </>
            )}

            {queryB.exploreName && isInitialLoading && <LoadingSkeleton />}

            {explore && (
                <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <ItemDetailProvider>
                        <ExploreTree
                            explore={explore}
                            selection={selection}
                            onSelectedFieldChange={toggleFieldB}
                        />
                    </ItemDetailProvider>
                </Box>
            )}
        </Stack>
    );
};
