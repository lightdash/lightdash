import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Checkbox,
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type GroupProps,
} from '@mantine/core';
import { useListState } from '@mantine/hooks';
import { IconSearch, IconTag, IconX } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
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

type Props = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    totalResults: number;
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
                </Popover.Target>
                <Popover.Dropdown>
                    <Stack spacing="sm">
                        <Group position="apart">
                            <Text weight={500}>Filter by categories</Text>
                        </Group>
                        {categories?.map((category) => (
                            <Checkbox
                                key={category.tagUuid}
                                label={<CatalogCategory category={category} />}
                                checked={selectedCategories.includes(
                                    category.tagUuid,
                                )}
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
    ({ search, setSearch, totalResults, ...props }) => {
        const clearSearch = useCallback(() => setSearch(''), [setSearch]);

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
                    <Divider
                        orientation="vertical"
                        w={1}
                        h={20}
                        sx={{ alignSelf: 'center', borderColor: '#DEE2E6' }}
                    />
                    {/* Categories filter */}
                    <CategoriesFilter />
                </Group>
                <Badge
                    bg="#F8F9FC"
                    c="#363F72"
                    radius={6}
                    py="two"
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
            </Group>
        );
    },
);
