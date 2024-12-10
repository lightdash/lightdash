import { FeatureFlags, type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Center,
    Checkbox,
    Divider,
    Group,
    Popover,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type GroupProps,
} from '@mantine/core';
import {
    IconList,
    IconSearch,
    IconSitemap,
    IconTag,
    IconX,
} from '@tabler/icons-react';
import { memo, useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { TotalMetricsDot } from '../../../svgs/metricsCatalog';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useProjectTags } from '../hooks/useProjectTags';
import { CatalogCategory } from './CatalogCategory';

export enum MetricCatalogView {
    LIST = 'list',
    TREE = 'tree',
}

type CategoriesFilterProps = {
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
};

const CategoriesFilter: FC<CategoriesFilterProps> = ({
    selectedCategories,
    setSelectedCategories,
}) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    // Categories are just tags
    const { data: categories, isLoading } = useProjectTags(projectUuid);

    const hasSelectedCategories = selectedCategories.length > 0;

    const categoryNames = useMemo(
        () =>
            categories
                ?.filter((category) =>
                    selectedCategories.includes(category.tagUuid),
                )
                .map((category) => category.name)
                .join(', '),
        [categories, selectedCategories],
    );

    return (
        <Group spacing="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Filter metrics by category"
                    >
                        <Button
                            h={32}
                            c="gray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftIcon={
                                <MantineIcon
                                    icon={IconTag}
                                    size="md"
                                    color={
                                        hasSelectedCategories
                                            ? 'indigo.5'
                                            : 'gray.5'
                                    }
                                />
                            }
                            loading={isLoading}
                            styles={(theme) => ({
                                root: {
                                    border: hasSelectedCategories
                                        ? `1px solid ${theme.colors.indigo[2]}`
                                        : `1px dashed ${theme.colors.gray[3]}`,
                                    backgroundColor: hasSelectedCategories
                                        ? theme.colors.indigo[0]
                                        : undefined,
                                    textOverflow: 'ellipsis',
                                    boxShadow: theme.shadows.subtle,
                                    '&:hover': {
                                        backgroundColor: theme.colors.gray[0],
                                        transition: `background-color ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                    },
                                },
                                label: {
                                    height: 24,
                                },
                            })}
                        >
                            {hasSelectedCategories
                                ? categoryNames
                                : 'All categories'}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack spacing={4}>
                        <Text fz="xs" c="dark.3" fw={600}>
                            Filter by categories:
                        </Text>

                        {categories?.length === 0 && (
                            <Text fz="xs" fw={500} c="gray.6">
                                No categories added yet. Click on the category
                                cells to assign categories to your metrics.
                            </Text>
                        )}

                        <Stack spacing="xs">
                            {categories?.map((category) => (
                                <Checkbox
                                    key={category.tagUuid}
                                    label={
                                        <CatalogCategory category={category} />
                                    }
                                    checked={selectedCategories.includes(
                                        category.tagUuid,
                                    )}
                                    size="xs"
                                    styles={(theme) => ({
                                        body: {
                                            alignItems: 'center',
                                        },
                                        input: {
                                            borderRadius: theme.radius.sm,
                                            border: `1px solid ${theme.colors.gray[4]}`,
                                        },
                                        label: {
                                            paddingLeft: theme.spacing.xs,
                                        },
                                    })}
                                    onChange={() => {
                                        if (
                                            selectedCategories.includes(
                                                category.tagUuid,
                                            )
                                        ) {
                                            setSelectedCategories(
                                                selectedCategories.filter(
                                                    (c) =>
                                                        c !== category.tagUuid,
                                                ),
                                            );
                                        } else {
                                            setSelectedCategories([
                                                ...selectedCategories,
                                                category.tagUuid,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedCategories && (
                <Tooltip variant="xs" label="Clear all categories">
                    <ActionIcon
                        size="xs"
                        color="gray.5"
                        onClick={() => {
                            setSelectedCategories([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

type MetricsTableTopToolbarProps = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
    totalResults: number;
    segmentedControlTooltipLabel?: string;
    showCategoriesFilter?: boolean;
    isValidMetricsTree: boolean;
    onMetricCatalogViewChange?: (view: MetricCatalogView) => void;
    metricCatalogView: MetricCatalogView;
};

export const MetricsTableTopToolbar: FC<MetricsTableTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        totalResults,
        selectedCategories,
        setSelectedCategories,
        showCategoriesFilter,
        isValidMetricsTree,
        segmentedControlTooltipLabel,
        onMetricCatalogViewChange,
        metricCatalogView,
        ...props
    }) => {
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);

        const isMetricTreesFeatureFlagEnabled = useFeatureFlagEnabled(
            FeatureFlags.MetricTrees,
        );

        return (
            <Group {...props}>
                <Group spacing="xs">
                    {/* Search input */}
                    <TextInput
                        size="xs"
                        radius="md"
                        styles={(theme) => ({
                            input: {
                                height: 32,
                                width: 309,
                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                textOverflow: 'ellipsis',
                                fontSize: theme.fontSizes.sm,
                                fontWeight: 400,
                                color: search
                                    ? theme.colors.gray[8]
                                    : theme.colors.gray[5],
                                boxShadow: theme.shadows.subtle,
                                border: `1px solid ${theme.colors.gray[3]}`,
                                '&:hover': {
                                    border: `1px solid ${theme.colors.gray[4]}`,
                                },
                                '&:focus': {
                                    border: `1px solid ${theme.colors.blue[5]}`,
                                },
                            },
                        })}
                        type="search"
                        variant="default"
                        placeholder="Search by name or description"
                        value={search ?? ''}
                        icon={
                            <MantineIcon
                                size="md"
                                color="gray.6"
                                icon={IconSearch}
                            />
                        }
                        onChange={(e) => setSearch(e.target.value)}
                        rightSection={
                            search && (
                                <ActionIcon
                                    onClick={clearSearch}
                                    variant="transparent"
                                    size="xs"
                                    color="gray.5"
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )
                        }
                    />

                    {/* Categories filter */}
                    {showCategoriesFilter && (
                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            sx={{
                                alignSelf: 'center',
                                borderColor: '#DEE2E6',
                            }}
                        />
                    )}
                    {showCategoriesFilter && (
                        <CategoriesFilter
                            selectedCategories={selectedCategories}
                            setSelectedCategories={setSelectedCategories}
                        />
                    )}
                </Group>
                <Group spacing="xs">
                    <Badge
                        bg="#F8F9FC"
                        c="#363F72"
                        radius={6}
                        py="sm"
                        px="xs"
                        tt="none"
                    >
                        <Group spacing={6}>
                            <TotalMetricsDot />
                            <Text fz="sm" fw={500}>
                                {totalResults} metrics
                            </Text>
                        </Group>
                    </Badge>
                    {isMetricTreesFeatureFlagEnabled && (
                        <>
                            <Divider
                                orientation="vertical"
                                w={1}
                                h={20}
                                sx={{
                                    alignSelf: 'center',
                                    borderColor: '#DEE2E6',
                                }}
                            />
                            <Tooltip
                                withinPortal
                                variant="xs"
                                label={segmentedControlTooltipLabel}
                                disabled={isValidMetricsTree}
                            >
                                <SegmentedControl
                                    size="xs"
                                    value={metricCatalogView}
                                    styles={(theme) => ({
                                        // TODO: Take care of padding
                                        root: {
                                            borderRadius: theme.radius.md,
                                            gap: theme.spacing.two,
                                        },
                                        indicator: {
                                            borderRadius: theme.radius.md,
                                            border: `1px solid ${theme.colors.gray[2]}`,
                                            backgroundColor: 'white',
                                            boxShadow: theme.shadows.subtle,
                                        },
                                    })}
                                    data={[
                                        {
                                            label: (
                                                <Center>
                                                    <MantineIcon
                                                        icon={IconList}
                                                        size="md"
                                                    />
                                                </Center>
                                            ),
                                            value: MetricCatalogView.LIST,
                                        },
                                        {
                                            label: (
                                                <Center>
                                                    <MantineIcon
                                                        icon={IconSitemap}
                                                        size="md"
                                                    />
                                                </Center>
                                            ),
                                            value: MetricCatalogView.TREE,
                                            disabled: !isValidMetricsTree,
                                        },
                                    ]}
                                    onChange={(value) => {
                                        onMetricCatalogViewChange?.(
                                            value as MetricCatalogView,
                                        );
                                    }}
                                />
                            </Tooltip>
                        </>
                    )}
                </Group>
            </Group>
        );
    },
);
