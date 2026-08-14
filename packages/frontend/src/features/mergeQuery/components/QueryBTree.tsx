import { Box, Button, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMemo, type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import BasePanel from '../../../components/Explorer/ExploreSideBar/BasePanel';
import ExploreTree from '../../../components/Explorer/ExploreTree';
import LoadingSkeleton from '../../../components/Explorer/ExploreTree/LoadingSkeleton';
import { type SelectedField } from '../../../components/Explorer/ExploreTree/SelectedFieldsSection';
import { ItemDetailProvider } from '../../../components/Explorer/ExploreTree/TableTree/ItemDetailProvider';
import { useExplore } from '../../../hooks/useExplore';
import { useMerge } from '../context/useMerge';

/**
 * The field picker for the second query, shown when its tab has the focus.
 *
 * The explorer's own tree, pointed at the second query's explore and its
 * selection. Picking fields is picking fields: search, grouping, descriptions
 * and field detail all work here because it is the same component, not a
 * second and worse one that has to be kept in step.
 */
export const QueryBTree: FC<{
    isChoosingExplore: boolean;
    setIsChoosingExplore: Dispatch<SetStateAction<boolean>>;
    selectedFields: SelectedField[];
    hideSelectedFields?: boolean;
}> = ({
    isChoosingExplore,
    setIsChoosingExplore,
    selectedFields,
    hideSelectedFields = false,
}) => {
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
            <Button
                variant="subtle"
                size="compact-xs"
                w="fit-content"
                leftSection={<MantineIcon icon={IconArrowLeft} size={13} />}
                onClick={() => setIsChoosingExplore(true)}
            >
                Change table
            </Button>

            {queryB.exploreName && isInitialLoading && <LoadingSkeleton />}

            {explore && (
                <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <ItemDetailProvider>
                        <ExploreTree
                            explore={explore}
                            selection={selection}
                            onSelectedFieldChange={toggleFieldB}
                            selectedFieldsOverride={selectedFields}
                            hideSelectedFields={hideSelectedFields}
                        />
                    </ItemDetailProvider>
                </Box>
            )}
        </Stack>
    );
};
