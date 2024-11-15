import { type CatalogField } from '@lightdash/common';
import {
    Flex,
    Group,
    Highlight,
    HoverCard,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type MRT_ColumnDef } from 'mantine-react-table';
import { useMemo, type FC, type SVGProps } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    Description,
    Hash,
    Popularity,
    Tag,
} from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { setCategoryPopoverIsClosing } from '../store/metricsCatalogSlice';
import { CatalogCategory } from './CatalogCategory';
import { ExploreMetricButton } from './ExploreMetricButton';
import { MetricChartUsageButton } from './MetricChartUsageButton';
import { MetricsCatalogCategoryForm } from './MetricsCatalogCategoryForm';
import { MetricsCatalogColumnName } from './MetricsCatalogColumnName';

const HeaderCell = ({
    children,
    Icon,
    tooltipLabel,
}: {
    children: React.ReactNode;
    tooltipLabel?: string;
    Icon: FC<SVGProps<SVGSVGElement>>;
}) => {
    return (
        <Tooltip variant="xs" label={tooltipLabel} disabled={!tooltipLabel}>
            <Group spacing={6} mr={6} h="100%" noWrap>
                <Icon />
                <Text
                    fz="xs"
                    fw={600}
                    color="dark.3"
                    sx={{
                        userSelect: 'none',
                    }}
                >
                    {children}
                </Text>
            </Group>
        </Tooltip>
    );
};

export const MetricsCatalogColumns: MRT_ColumnDef<CatalogField>[] = [
    {
        accessorKey: 'name',
        header: 'Metric',
        enableSorting: true,
        enableEditing: false,
        size: 400,
        Header: ({ column }) => (
            <HeaderCell Icon={Hash}>{column.columnDef.header}</HeaderCell>
        ),
        Cell: ({ row, table }) => {
            return (
                <Flex justify="space-between" align="center" w="100%">
                    <MetricsCatalogColumnName row={row} table={table} />
                    <ExploreMetricButton row={row} className="explore-button" />
                </Flex>
            );
        },
    },
    {
        accessorKey: 'description',
        enableSorting: false,
        enableEditing: false,
        size: 500,
        header: 'Description',
        Header: ({ column }) => (
            <HeaderCell
                Icon={Description}
                tooltipLabel="Defined in the metric's .yml file"
            >
                {column.columnDef.header}
            </HeaderCell>
        ),
        Cell: ({ table, row }) => (
            <HoverCard
                withinPortal
                shadow="lg"
                position="right"
                disabled={!row.original.description}
                radius="md"
            >
                <HoverCard.Target>
                    <Text
                        lineClamp={2}
                        c={row.original.description ? 'dark.4' : 'dark.1'}
                        fz="sm"
                        fw={400}
                        lh="150%"
                    >
                        <Highlight
                            highlight={table.getState().globalFilter || ''}
                            lh="150%"
                        >
                            {row.original.description ?? '-'}
                        </Highlight>
                    </Text>
                </HoverCard.Target>
                <HoverCard.Dropdown maw={300}>
                    <MarkdownPreview
                        source={row.original.description}
                        style={{
                            fontSize: '12px',
                        }}
                    />
                </HoverCard.Dropdown>
            </HoverCard>
        ),
    },
    {
        accessorKey: 'categories',
        header: 'Category',
        enableSorting: false,
        enableEditing: true,
        size: 300,
        minSize: 180,
        mantineTableBodyCellProps: () => {
            return {
                pos: 'relative',
                sx: {
                    padding: 0,
                    '&:hover': {
                        outline: 'none',
                    },
                },
            };
        },
        Header: ({ column }) => (
            <HeaderCell
                Icon={Tag}
                tooltipLabel="Click to add or edit a category, if you have the required permissions."
            >
                {column.columnDef.header}
            </HeaderCell>
        ),
        Edit: ({ table, row, cell }) => {
            const dispatch = useAppDispatch();
            const canManageTags = useAppSelector(
                (state) => state.metricsCatalog.abilities.canManageTags,
            );

            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                <Group spacing="xxs" pos="relative" w="100%" h="100%">
                    {categories.map((category) => (
                        <CatalogCategory
                            key={category.tagUuid}
                            category={category}
                        />
                    ))}
                    {canManageTags && (
                        <MetricsCatalogCategoryForm
                            catalogSearchUuid={row.original.catalogSearchUuid}
                            metricCategories={categories}
                            opened={
                                table.getState().editingCell?.id === cell.id
                            }
                            onClose={() => {
                                dispatch(setCategoryPopoverIsClosing(true));
                                table.setEditingCell(null);

                                // Resetting the state to avoid race conditions with the category cell click
                                setTimeout(() => {
                                    dispatch(
                                        setCategoryPopoverIsClosing(false),
                                    );
                                }, 100);
                            }}
                        />
                    )}
                </Group>
            );
        },
        Cell: ({ row, table, cell }) => {
            const { hovered, ref } = useHover();
            const isCategoryPopoverClosing = useAppSelector(
                (state) => state.metricsCatalog.popovers.category.isClosing,
            );

            const categories = useMemo(
                () => row.original.categories ?? [],
                [row],
            );

            return (
                // This is a hack to make the whole cell clickable and avoid race conditions with click outside events
                <Flex
                    ref={ref}
                    pos="absolute"
                    py={6}
                    px="md"
                    left={0}
                    top={0}
                    w="100%"
                    h="100%"
                    onClick={() => {
                        if (isCategoryPopoverClosing) {
                            return;
                        }

                        table.setEditingCell(cell);
                    }}
                >
                    {categories.length === 0 && hovered ? (
                        <Group spacing={2}>
                            <MantineIcon
                                color="dark.1"
                                icon={IconPlus}
                                size={12}
                            />
                            <Text span fz="sm" color="dark.1">
                                Click to add
                            </Text>
                        </Group>
                    ) : (
                        <Group spacing="xxs" pos="relative" w="100%" h="100%">
                            {categories.map((category) => (
                                <CatalogCategory
                                    key={category.tagUuid}
                                    category={category}
                                />
                            ))}
                        </Group>
                    )}
                </Flex>
            );
        },
    },
    {
        accessorKey: 'chartUsage',
        header: 'Popularity',
        enableSorting: true,
        enableEditing: false,
        size: 150,
        mantineTableBodyCellProps: () => {
            return {
                sx: {
                    justifyContent: 'center',
                },
            };
        },
        Header: ({ column }) => (
            <HeaderCell
                Icon={Popularity}
                tooltipLabel="Shows how many charts use this metric."
            >
                {column.columnDef.header}
            </HeaderCell>
        ),
        Cell: ({ row }) => <MetricChartUsageButton row={row} />,
    },
];
