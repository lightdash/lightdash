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

/** Field picker for a source owned by the merge editor. */
export const MergeSourceTree: FC<{
    sourceId: string;
    isChoosingExplore: boolean;
    setIsChoosingExplore: Dispatch<SetStateAction<boolean>>;
    selectedFields: SelectedField[];
    hideSelectedFields?: boolean;
}> = ({
    sourceId,
    isChoosingExplore,
    setIsChoosingExplore,
    selectedFields,
    hideSelectedFields = false,
}) => {
    const merge = useMerge();
    const source = merge.additionalSources.find(({ id }) => id === sourceId);
    const { data: explore, isInitialLoading } = useExplore(
        source?.exploreName ?? undefined,
    );

    const selection = useMemo(
        () => ({
            activeFields: new Set([
                ...(source?.dimensions ?? []),
                ...(source?.metrics ?? []),
            ]),
            selectedDimensions: source?.dimensions ?? [],
        }),
        [source?.dimensions, source?.metrics],
    );
    if (!source) return null;

    if (isChoosingExplore) {
        return (
            <Stack gap="xs" h="100%" mih={0}>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    w="fit-content"
                    leftSection={<MantineIcon icon={IconArrowLeft} size={13} />}
                    onClick={() => setIsChoosingExplore(false)}
                >
                    Back to fields
                </Button>
                <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <BasePanel
                        onExploreClick={(selectedExplore) => {
                            if (selectedExplore.name !== source.exploreName) {
                                merge.setSourceExplore(
                                    source.id,
                                    selectedExplore.name,
                                );
                            }
                            setIsChoosingExplore(false);
                        }}
                        onExploreCreated={(exploreName) => {
                            merge.setSourceExplore(source.id, exploreName);
                            setIsChoosingExplore(false);
                        }}
                    />
                </Box>
            </Stack>
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

            {source.exploreName && isInitialLoading && <LoadingSkeleton />}

            {explore && (
                <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <ItemDetailProvider>
                        <ExploreTree
                            explore={explore}
                            selection={selection}
                            onSelectedFieldChange={(fieldId, isDimension) =>
                                merge.toggleSourceField(
                                    source.id,
                                    fieldId,
                                    isDimension,
                                )
                            }
                            selectedFieldsOverride={selectedFields}
                            hideSelectedFields={hideSelectedFields}
                        />
                    </ItemDetailProvider>
                </Box>
            )}
        </Stack>
    );
};
