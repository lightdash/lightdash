import { subject } from '@casl/ability';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Badge,
    Box,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useProject } from '../../../hooks/useProject';
import useSearchParams from '../../../hooks/useSearchParams';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useApp } from '../../../providers/AppProvider';
import { MetricsCatalogIcon } from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    setAbility,
    setActiveMetric,
    setCategoryFilters,
    setOrganizationUuid,
    setProjectUuid,
    toggleMetricPeekModal,
} from '../store/metricsCatalogSlice';
import { MetricChartUsageModal } from './MetricChartUsageModal';
import { MetricPeekModal } from './MetricPeekModal';
import { MetricsTable } from './MetricsTable';

const InfoPopover: FC = () => {
    const canRefreshCatalog = useAppSelector(
        (state) => state.metricsCatalog.abilities.canRefreshCatalog,
    );

    if (!canRefreshCatalog) return null;

    return (
        <Popover
            width={250}
            offset={{
                mainAxis: 10,
                crossAxis: -100,
            }}
            position="bottom-start"
        >
            <Popover.Target>
                <Tooltip variant="xs" label="Learn more" position="top">
                    <ActionIcon
                        variant="subtle"
                        color="gray.8"
                        size="xs"
                        radius="xl"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack spacing="sm">
                    <Stack spacing="xs">
                        <Text fw={600} size="sm">
                            Metrics Catalog
                        </Text>
                        <Text size="xs" c="gray.6">
                            Explore metrics tailored to your access with
                            permissions inherited from tables and user
                            attributes.
                        </Text>
                    </Stack>
                    <Stack spacing="xs">
                        <Text fw={600} size="sm">
                            Set Default Time Dimensions for Metrics
                        </Text>
                        <Text size="xs" c="gray.6">
                            Enhance the metrics catalog experience by setting a
                            default time dimension in your model .yml files.
                            Metrics will open in the explorer with the correct
                            time dimension pre-applied, ensuring your users
                            start with the right context every time.
                        </Text>
                        <Anchor
                            href="https://docs.lightdash.com/guides/metrics-catalog"
                            target="_blank"
                            size="xs"
                        >
                            Learn how to configure default time dimensions →
                        </Anchor>
                    </Stack>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export const MetricsCatalogPanel = () => {
    const dispatch = useAppDispatch();
    const theme = useMantineTheme();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const history = useHistory();
    const categoriesParam = useSearchParams('categories');
    const categories = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );

    const [lastDbtRefreshAt, setLastDbtRefreshAt] = useState<
        Date | undefined
    >();
    const timeAgo = useTimeAgo(lastDbtRefreshAt || new Date());
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();

    const isMetricUsageModalOpen = useAppSelector(
        (state) => state.metricsCatalog.modals.chartUsageModal.isOpen,
    );
    const onCloseMetricUsageModal = () => {
        dispatch(setActiveMetric(undefined));
    };
    const isMetricPeekModalOpen = useAppSelector(
        (state) => state.metricsCatalog.modals.metricPeekModal.isOpen,
    );
    const onCloseMetricPeekModal = () => {
        dispatch(toggleMetricPeekModal(undefined));
    };
    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    useEffect(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [params.projectUuid, dispatch, projectUuid]);

    useEffect(() => {
        if (!organizationUuid && project?.organizationUuid) {
            dispatch(setOrganizationUuid(project.organizationUuid));
        }
    }, [project, dispatch, organizationUuid]);

    useEffect(() => {
        const urlCategories =
            categoriesParam?.split(',').map(decodeURIComponent) || [];
        dispatch(setCategoryFilters(urlCategories));
    }, [categoriesParam, dispatch]);

    useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        if (categories.length > 0) {
            queryParams.set(
                'categories',
                categories.map(encodeURIComponent).join(','),
            );
        } else {
            queryParams.delete('categories');
        }
        history.replace({ search: queryParams.toString() });
    }, [categories, history]);

    useEffect(
        function handleAbilities() {
            if (user.data) {
                const canManageTags = user.data.ability.can(
                    'manage',
                    subject('Tags', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                const canRefreshCatalog =
                    user.data.ability.can('manage', 'Job') ||
                    user.data.ability.can('manage', 'CompileProject');

                const canManageExplore = user.data.ability.can(
                    'manage',
                    'Explore',
                );

                const canManageMetricsTree = user.data.ability.can(
                    'manage',
                    'MetricsTree',
                );

                dispatch(
                    setAbility({
                        canManageTags,
                        canRefreshCatalog,
                        canManageExplore,
                        canManageMetricsTree,
                    }),
                );
            }
        },
        [user.data, dispatch, projectUuid],
    );

    useEffect(
        function openMetricPeekModal() {
            if (tableName && metricName) {
                dispatch(
                    toggleMetricPeekModal({
                        name: metricName,
                        tableName,
                    }),
                );
            }
        },
        [tableName, metricName, dispatch],
    );

    const handleRefreshDbt = () => {
        setLastDbtRefreshAt(new Date());
    };

    return (
        <Stack w="100%" spacing="xxl">
            <Group position="apart">
                <Group spacing="sm">
                    <Avatar
                        src={MetricsCatalogIcon}
                        alt="Metrics Catalog"
                        size={48}
                    />
                    <Box>
                        <Group spacing="xs">
                            <Text color="gray.8" weight={600} size="xl">
                                Metrics Catalog
                            </Text>
                            <Tooltip
                                variant="xs"
                                label="This feature is in beta. We're actively testing and improving it—your feedback is welcome!"
                                position="top"
                            >
                                <Badge
                                    variant="filled"
                                    color="indigo.5"
                                    radius="sm"
                                    size="xs"
                                    sx={{
                                        border: `1px solid ${theme.colors.indigo[2]}`,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Alpha
                                </Badge>
                            </Tooltip>
                        </Group>
                        <Text color="gray.6" size="sm" weight={400}>
                            Browse all Metrics & KPIs across this project
                        </Text>
                    </Box>
                </Group>
                <Group spacing="xs">
                    <RefreshDbtButton
                        onClick={handleRefreshDbt}
                        leftIcon={
                            <MantineIcon
                                size="sm"
                                color="gray.7"
                                icon={IconRefresh}
                            />
                        }
                        buttonStyles={{
                            borderRadius: theme.radius.md,
                            backgroundColor: '#FAFAFA',
                            border: `1px solid ${theme.colors.gray[2]}`,
                            padding: `${theme.spacing.xxs} 10px ${theme.spacing.xxs} ${theme.spacing.xs}`,
                            fontSize: theme.fontSizes.sm,
                            fontWeight: 500,
                            color: theme.colors.gray[7],
                        }}
                        defaultTextOverride={
                            lastDbtRefreshAt
                                ? `Last refreshed ${timeAgo}`
                                : 'Refresh catalog'
                        }
                        refreshingTextOverride="Refreshing catalog"
                    />
                    <InfoPopover />
                </Group>
            </Group>
            <MetricsTable />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
            {isMetricPeekModalOpen && (
                <MetricPeekModal
                    opened={isMetricPeekModalOpen}
                    onClose={onCloseMetricPeekModal}
                />
            )}
        </Stack>
    );
};
