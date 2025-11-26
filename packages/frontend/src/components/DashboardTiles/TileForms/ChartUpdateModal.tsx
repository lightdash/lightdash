import {
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    type ChartContent,
    type DashboardChartTile,
    type DashboardSqlChartTile,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    Group,
    Loader,
    Modal,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    type ModalProps,
    type ScrollAreaProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import MantineIcon from '../../common/MantineIcon';

interface ChartUpdateModalProps extends ModalProps {
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
    onClose,
    onConfirm,
    hideTitle,
    tile,
    ...modalProps
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
        <Modal
            onClose={() => onClose?.()}
            title={<Title order={4}>Edit tile content</Title>}
            withCloseButton
            className="non-draggable"
            {...modalProps}
        >
            <form onSubmit={handleConfirm} name="Edit tile content">
                <Stack spacing="md">
                    <Flex align="flex-end" gap="xs">
                        <TextInput
                            label="Title"
                            placeholder={tile.properties.chartName || undefined}
                            {...form.getInputProps('title')}
                            style={{ flex: 1 }}
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
                                icon={
                                    form.values.hideTitle ? IconEyeOff : IconEye
                                }
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
                                        backgroundColor:
                                            theme.colors.background[0],
                                    },
                                    separatorLabel: {
                                        color: theme.colors.ldGray[6],
                                        fontWeight: 500,
                                    },
                                })}
                                id="savedChartUuid"
                                name="savedChartUuid"
                                label="Select chart"
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
                                    isFetching && (
                                        <Loader size="xs" color="gray" />
                                    )
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
                                                    variant="white"
                                                    onClick={async () => {
                                                        await fetchNextPage();
                                                    }}
                                                    disabled={isFetching}
                                                >
                                                    <Text>Load more</Text>
                                                </Button>
                                            )}
                                        </>
                                    </ScrollArea>
                                )}
                            />
                        )}
                    <Group spacing="xs" position="right" mt="md">
                        <Button onClick={() => onClose?.()} variant="outline">
                            Cancel
                        </Button>
                        <Button type="submit">Update</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default ChartUpdateModal;
