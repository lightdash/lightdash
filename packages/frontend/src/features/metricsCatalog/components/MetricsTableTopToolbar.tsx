import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Checkbox,
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
                        size="xs"
                        color="gray.5"
                        c={hasSelectedCategories ? 'gray.8' : 'gray.6'}
                        variant="default"
                        radius="md"
                        leftIcon={<MantineIcon icon={IconTag} color="gray.6" />}
                        loading={isLoading}
                        sx={(theme) => ({
                            border: hasSelectedCategories
                                ? `1px solid ${theme.colors.indigo[4]}`
                                : `1px dashed ${theme.colors.gray[4]}`,
                            backgroundColor: theme.fn.lighten(
                                hasSelectedCategories
                                    ? theme.colors.indigo[0]
                                    : theme.colors.gray[0],
                                0.3,
                            ),
                            fontWeight: hasSelectedCategories ? 400 : 500,
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
                        w={300}
                        type="search"
                        variant="default"
                        placeholder="Search by metric name or description"
                        value={search}
                        icon={<MantineIcon icon={IconSearch} />}
                        onChange={(e) => setSearch(e.target.value)}
                        rightSection={
                            search && (
                                <ActionIcon
                                    onClick={clearSearch}
                                    variant="transparent"
                                    size="xs"
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )
                        }
                    />
                    {/* Categories filter */}
                    <CategoriesFilter />
                </Group>
                <Badge size="sm" color="violet">
                    {totalResults}
                </Badge>
            </Group>
        );
    },
);
