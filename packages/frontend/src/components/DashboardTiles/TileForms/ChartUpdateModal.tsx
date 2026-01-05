import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type ChartContent,
    type DashboardChartTile,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import { ActionIcon, Button, Flex, Loader, TextInput } from '@mantine-8/core';
import { ScrollArea, Select, type ScrollAreaProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

interface ChartUpdateModalProps {
    opened: boolean;
    onClose: () => void;
    hideTitle: boolean;
    onConfirm?: (
        newTitle: string | undefined,
        newChartUuid: string,
        shouldHideTitle: boolean,
    ) => void;
    tile: DashboardChartTile | DashboardSqlChartTile;
}

const ChartUpdateModal = ({
    opened,
    onClose,
    onConfirm,
    hideTitle,
    tile,
}: ChartUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            uuid: isDashboardSqlChartTile(tile)
                ? tile.properties.savedSqlUuid
                : tile.properties.savedChartUuid,
            title: tile.properties.title,
            hideTitle,
        },
    });
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const selectScrollRef = useRef<HTMLDivElement>(null);
    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useChartSummariesV2(
        {
            projectUuid,
            page: 1,
            pageSize: 25,
            search: debouncedSearchQuery,
        },
        { keepPreviousData: true },
    );
    useEffect(() => {
        selectScrollRef.current?.scrollTo({
            top: selectScrollRef.current?.scrollHeight,
        });
    }, [chartPages]);
    // Aggregates all fetched charts across pages and search queries into a unified list.
    // This ensures that previously fetched chart are preserved even when the search query changes.
    // Uses 'uuid' to remove duplicates and maintain a consistent set of unique charts.
    const [savedCharts, setSavedQueries] = useState<ChartContent[]>([]);
    useEffect(() => {
        const allPages = chartPages?.pages.map((p) => p.data).flat() ?? [];

        setSavedQueries((previousState) =>
            uniqBy([...previousState, ...allPages], 'uuid'),
        );
    }, [chartPages?.pages]);

    const handleConfirm = form.onSubmit(
        ({
            title: newTitle,
            uuid: newChartUuid,
            hideTitle: shouldHideTitle,
        }) => {
            if (newChartUuid) {
                onConfirm?.(newTitle, newChartUuid, shouldHideTitle);
            }
        },
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            icon={IconPencil}
            title="Edit tile content"
            modalRootProps={{ className: 'non-draggable' }}
            actions={
                <Button type="submit" form="edit-tile-content">
                    Update
                </Button>
            }
        >
            <form
                id="edit-tile-content"
                onSubmit={handleConfirm}
                name="Edit tile content"
            >
                <Flex align="flex-end" gap="xs" mb="md">
                    <TextInput
                        label="Title"
                        placeholder={tile.properties.chartName || undefined}
                        {...form.getInputProps('title')}
                        flex={1}
                        disabled={form.values.hideTitle}
                    />
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        onClick={() =>
                            form.setFieldValue(
                                'hideTitle',
                                !form.values.hideTitle,
                            )
                        }
                    >
                        <MantineIcon
                            icon={form.values.hideTitle ? IconEyeOff : IconEye}
                        />
                    </ActionIcon>
                </Flex>
                {isDashboardChartTileType(tile) &&
                    tile.properties.belongsToDashboard && (
                        <Select
                            styles={(theme) => ({
                                separator: {
                                    position: 'sticky',
                                    top: 0,
                                    backgroundColor: theme.colors.background[0],
                                },
                                separatorLabel: {
                                    color: theme.colors.ldGray[6],
                                    fontWeight: 500,
                                },
                            })}
                            id="savedChartUuid"
                            name="savedChartUuid"
                            label="Select chart"
                            radius="md"
                            data={(savedCharts || []).map(
                                ({ uuid, name, space }) => {
                                    return {
                                        value: uuid,
                                        label: name,
                                        group: space.name,
                                    };
                                },
                            )}
                            disabled={isInitialLoading}
                            withinPortal
                            {...form.getInputProps('uuid')}
                            searchable
                            placeholder="Search..."
                            nothingFound="No charts found"
                            clearable
                            searchValue={searchQuery}
                            onSearchChange={setSearchQuery}
                            maxDropdownHeight={300}
                            rightSection={
                                isFetching && <Loader size="xs" color="gray" />
                            }
                            dropdownComponent={({
                                children,
                                ...rest
                            }: ScrollAreaProps) => (
                                <ScrollArea
                                    {...rest}
                                    viewportRef={selectScrollRef}
                                >
                                    <>
                                        {children}
                                        {hasNextPage && (
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                fullWidth
                                                onClick={async () => {
                                                    await fetchNextPage();
                                                }}
                                                disabled={isFetching}
                                            >
                                                Load more
                                            </Button>
                                        )}
                                    </>
                                </ScrollArea>
                            )}
                        />
                    )}
            </form>
        </MantineModal>
    );
};

export default ChartUpdateModal;
