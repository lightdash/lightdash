import { type CatalogField } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Center,
    Divider,
    Group,
    SegmentedControl,
    Text,
    TextInput,
    Tooltip,
    type GroupProps,
} from '@mantine/core';
import { IconList, IconSearch, IconSitemap, IconX } from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { TotalMetricsDot } from '../../../../svgs/metricsCatalog';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { MetricCatalogView } from '../../types';
import CategoriesFilter from './CategoriesFilter';
import SegmentedControlHoverCard from './SegmentedControlHoverCard';

type MetricsTableTopToolbarProps = GroupProps & {
    search: string | undefined;
    setSearch: (search: string) => void;
    selectedCategories: CatalogField['categories'][number]['tagUuid'][];
    setSelectedCategories: (
        categories: CatalogField['categories'][number]['tagUuid'][],
    ) => void;
    totalResults: number;
    isValidMetricsNodeCount: boolean;
    isValidMetricsEdgeCount: boolean;
    showCategoriesFilter?: boolean;
    isValidMetricsTree: boolean;
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
        isValidMetricsNodeCount,
        isValidMetricsEdgeCount,
        metricCatalogView,
        ...props
    }) => {
        const userUuid = useAppSelector(
            (state) => state.metricsCatalog.user?.userUuid,
        );
        const organizationUuid = useAppSelector(
            (state) => state.metricsCatalog.organizationUuid,
        );
        const projectUuid = useAppSelector(
            (state) => state.metricsCatalog.projectUuid,
        );
        const { track } = useTracking();
        const location = useLocation();
        const navigate = useNavigate();
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
                        h={32}
                    >
                        <Group spacing={6}>
                            <TotalMetricsDot />
                            <Text fz="sm" fw={500}>
                                {totalResults} metrics
                            </Text>
                        </Group>
                    </Badge>
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
                            root: {
                                borderRadius: theme.radius.md,
                                gap: theme.spacing.two,
                                padding: theme.spacing.xxs,
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
                                    <Tooltip
                                        withinPortal
                                        variant="xs"
                                        label="List view"
                                        position="bottom-end"
                                    >
                                        <Center>
                                            <MantineIcon
                                                icon={IconList}
                                                size="md"
                                            />
                                        </Center>
                                    </Tooltip>
                                ),
                                value: MetricCatalogView.LIST,
                            },
                            {
                                label: (
                                    <SegmentedControlHoverCard
                                        totalMetricsCount={totalResults}
                                        isValidMetricsNodeCount={
                                            isValidMetricsNodeCount
                                        }
                                        isValidMetricsEdgeCount={
                                            isValidMetricsEdgeCount
                                        }
                                        withinPortal
                                        position="bottom-end"
                                        withArrow
                                    >
                                        <Center
                                            sx={{
                                                cursor: !isValidMetricsTree
                                                    ? 'not-allowed'
                                                    : 'pointer',
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconSitemap}
                                                size="md"
                                                opacity={
                                                    !isValidMetricsTree
                                                        ? 0.5
                                                        : 1
                                                }
                                            />
                                        </Center>
                                    </SegmentedControlHoverCard>
                                ),
                                value: MetricCatalogView.CANVAS,
                            },
                        ]}
                        onChange={(value) => {
                            if (!isValidMetricsTree) {
                                return;
                            }

                            const view = value as MetricCatalogView;

                            switch (view) {
                                case MetricCatalogView.LIST:
                                    void navigate({
                                        pathname: location.pathname.replace(
                                            /\/canvas/,
                                            '',
                                        ),
                                        search: location.search,
                                    });
                                    break;
                                case MetricCatalogView.CANVAS:
                                    track({
                                        name: EventName.METRICS_CATALOG_TREES_CANVAS_MODE_CLICKED,
                                        properties: {
                                            userId: userUuid,
                                            organizationId: organizationUuid,
                                            projectId: projectUuid,
                                        },
                                    });
                                    void navigate({
                                        pathname: `${location.pathname}/canvas`,
                                        search: location.search,
                                    });
                                    break;
                            }
                        }}
                    />
                </Group>
            </Group>
        );
    },
);
