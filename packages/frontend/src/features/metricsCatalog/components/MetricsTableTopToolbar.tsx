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
import { useListState } from '@mantine/hooks';
import {
    IconList,
    IconSearch,
    IconSitemap,
    IconTag,
    IconX,
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import { useTracking } from '../../../providers/TrackingProvider';
import { TotalMetricsDot } from '../../../svgs/metricsCatalog';
import { EventName } from '../../../types/Events';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useProjectTags } from '../hooks/useProjectTags';
import {
    clearCategoryFilters,
    setCategoryFilters,
} from '../store/metricsCatalogSlice';
import { CatalogCategory } from './CatalogCategory';

export enum MetricCatalogView {
    LIST = 'list',
    TREE = 'tree',
}

type Props = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    totalResults: number;
    showCategoriesFilter?: boolean;
    onMetricCatalogViewChange?: (view: MetricCatalogView) => void;
    metricCatalogView: MetricCatalogView;
};

const CategoriesFilter = () => {
    const { track } = useTracking();
    const dispatch = useAppDispatch();
    // Tracks selected categories while the popover is open - when the user closes the popover, the selected categories are set in the redux store,
    // which triggers a new search
    const [selectedCategories, selectedCategoriesHandlers] = useListState<
        CatalogField['categories'][number]['tagUuid']
    >([]);

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
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

    useEffect(() => {
        dispatch(setCategoryFilters(selectedCategories));

        // Track when categories are applied as filters
        if (selectedCategories.length > 0 && categories) {
            track({
                name: EventName.METRICS_CATALOG_CATEGORY_FILTER_APPLIED,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                },
            });
        }
    }, [
        dispatch,
        selectedCategories,
        categories,
        track,
        projectUuid,
        organizationUuid,
    ]);

    return (
        <Group spacing="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Easily filter metrics by category to find what you're looking for."
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
                                            selectedCategoriesHandlers.filter(
                                                (c) => c !== category.tagUuid,
                                            );
                                        } else {
                                            selectedCategoriesHandlers.append(
                                                category.tagUuid,
                                            );
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
                            selectedCategoriesHandlers.setState([]);
                            dispatch(clearCategoryFilters());
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export const MetricsTableTopToolbar: FC<Props> = memo(
    ({
        search,
        setSearch,
        totalResults,
        showCategoriesFilter,
        onMetricCatalogViewChange,
        metricCatalogView,
        ...props
    }) => {
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);

        const isMetricTreesEnabled = useFeatureFlagEnabled(
            FeatureFlags.MetricTrees,
        );

        return (
            <Group {...props}>
                <Group spacing="xs">
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Search by metric name or description"
                    >
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
                            value={search}
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
                    </Tooltip>
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
                    {showCategoriesFilter && <CategoriesFilter />}
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
                    {isMetricTreesEnabled && (
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
                                    },
                                ]}
                                onChange={(value) => {
                                    onMetricCatalogViewChange?.(
                                        value as MetricCatalogView,
                                    );
                                }}
                            />
                        </>
                    )}
                </Group>
            </Group>
        );
    },
);
