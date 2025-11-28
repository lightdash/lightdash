import { subject } from '@casl/ability';
import { isCompileJob } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Popover,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
    type ButtonProps,
} from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconRefresh, IconSparkles, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import MantineIcon from '../../../components/common/MantineIcon';
import { useProject } from '../../../hooks/useProject';
import useSearchParams from '../../../hooks/useSearchParams';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useActiveJob from '../../../providers/ActiveJob/useActiveJob';
import useApp from '../../../providers/App/useApp';
import { LearnMoreContent } from '../../../svgs/metricsCatalog';
import { useIndexCatalogJob } from '../../catalog/hooks/useIndexCatalogJob';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    setAbility,
    setActiveMetric,
    setCategoryFilters,
    setOrganizationUuid,
    setProjectUuid,
    setSearch,
    setTableSorting,
    setUser,
    toggleMetricExploreModal,
} from '../store/metricsCatalogSlice';
import { type MetricCatalogView } from '../types';
import { MetricChartUsageModal } from './MetricChartUsageModal';
import { MetricsTable } from './MetricsTable';

const LOCAL_STORAGE_KEY = 'metrics-catalog-learn-more-popover-closed';

const LearnMorePopover: FC<{ buttonStyles?: ButtonProps['style'] }> = ({
    buttonStyles,
}) => {
    const [opened, { close, open }] = useDisclosure(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const ref = useClickOutside(close, null, [buttonRef.current]);

    useEffect(() => {
        const hasPrevClosed = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!hasPrevClosed) {
            open();
        }
    }, [open]);

    const setLocalStorage = useCallback(() => {
        const hasPrevClosed = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!hasPrevClosed) {
            localStorage.setItem(LOCAL_STORAGE_KEY, 'true');
        }
    }, []);

    const handleClose = useCallback(() => {
        setLocalStorage();
        close();
    }, [close, setLocalStorage]);

    return (
        <Popover
            width={280}
            offset={{
                mainAxis: 10,
                crossAxis: -100,
            }}
            position="bottom-start"
            opened={opened}
            onClose={setLocalStorage}
            shadow="sm"
        >
            <Popover.Target>
                <Button
                    ref={buttonRef}
                    size="xs"
                    variant="default"
                    leftIcon={<MantineIcon icon={IconSparkles} />}
                    style={buttonStyles}
                    onClick={opened ? handleClose : open}
                >
                    Learn more
                </Button>
            </Popover.Target>
            <Popover.Dropdown
                bg="ldDark.6"
                c="white"
                p={16}
                sx={{
                    borderRadius: 12,
                    alignItems: 'flex-start',
                }}
            >
                <Stack spacing="sm" w="100%" ref={ref}>
                    <Group position="apart">
                        <Text fw={600} size={14}>
                            ✨ Lightdash Spotlight is here!
                        </Text>
                        <ActionIcon
                            variant="transparent"
                            size="xs"
                            onClick={handleClose}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>
                    <LearnMoreContent width="100%" height="100%" />
                    <Text size={13} c="ldGray.3">
                        Explore and curate your key Metrics in the{' '}
                        <Text span fw={600} inherit>
                            Catalog
                        </Text>{' '}
                        and click to visualize them over time in the{' '}
                        <Text span fw={600} inherit>
                            Explorer
                        </Text>
                        .
                    </Text>
                    <Group spacing="xs">
                        <Button
                            variant="outline"
                            radius="md"
                            bg="ldDark.4"
                            c="ldGray.0"
                            hidden={true}
                            disabled={true}
                            sx={(theme) => ({
                                display: 'none', // ! Disabled for now
                                border: 'none',
                                flexGrow: 1,
                                '&:hover': {
                                    backgroundColor: theme.colors.ldDark[5],
                                },
                            })}
                        >
                            View Demo
                        </Button>
                        <Button
                            component="a"
                            href="https://docs.lightdash.com/guides/metrics-catalog/"
                            target="_blank"
                            radius="md"
                            sx={{ border: 'none', flexGrow: 1 }}
                        >
                            Learn more
                        </Button>
                    </Group>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

type MetricsCatalogPanelProps = {
    metricCatalogView: MetricCatalogView;
};

export const MetricsCatalogPanel: FC<MetricsCatalogPanelProps> = ({
    metricCatalogView,
}) => {
    const dispatch = useAppDispatch();
    const theme = useMantineTheme();
    const { show: showIntercom } = useIntercom();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const navigate = useNavigate();
    const categoriesParam = useSearchParams('categories');
    const searchParam = useSearchParams('search');
    const sortingParam = useSearchParams('sortBy');
    const sortDirectionParam = useSearchParams('sortDirection');

    const categories = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );
    const search = useAppSelector((state) => state.metricsCatalog.search);
    const tableSorting = useAppSelector(
        (state) => state.metricsCatalog.tableSorting,
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

    // Track active compile job
    const { activeJob } = useActiveJob();
    // Track index catalog job
    const { isFetching: isIndexingCatalog } = useIndexCatalogJob(
        isCompileJob(activeJob)
            ? activeJob.jobResults?.indexCatalogJobUuid
            : undefined,
        async () => {
            setLastDbtRefreshAt(new Date());
        },
    );
    const isMetricUsageModalOpen = useAppSelector(
        (state) => state.metricsCatalog.modals.chartUsageModal.isOpen,
    );

    const onCloseMetricUsageModal = () => {
        dispatch(setActiveMetric(undefined));
    };

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    useEffect(() => {
        if (
            params.projectUuid &&
            (!projectUuid || projectUuid !== params.projectUuid)
        ) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    }, [params.projectUuid, dispatch, projectUuid]);

    useEffect(() => {
        if (
            project &&
            (!organizationUuid || organizationUuid !== project.organizationUuid)
        ) {
            dispatch(setOrganizationUuid(project.organizationUuid));
        }
    }, [project, dispatch, organizationUuid]);

    useEffect(() => {
        const urlCategories =
            categoriesParam?.split(',').map(decodeURIComponent) || [];
        const urlSearch = searchParam
            ? decodeURIComponent(searchParam)
            : undefined;
        const urlSortByParam = sortingParam
            ? decodeURIComponent(sortingParam)
            : undefined;
        const urlSortDirectionParam = sortDirectionParam
            ? decodeURIComponent(sortDirectionParam)
            : undefined;

        dispatch(setCategoryFilters(urlCategories));
        dispatch(setSearch(urlSearch));

        if (urlSortByParam) {
            dispatch(
                setTableSorting([
                    {
                        id: urlSortByParam,
                        desc: urlSortDirectionParam === 'desc',
                    },
                ]),
            );
        }
    }, [
        categoriesParam,
        dispatch,
        searchParam,
        sortingParam,
        sortDirectionParam,
    ]);

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

        if (search) {
            queryParams.set('search', encodeURIComponent(search));
        } else {
            queryParams.delete('search');
        }

        if (tableSorting.length > 0) {
            // TODO: Handle multiple sorting - this needs to be enabled and handled later in the backend
            queryParams.set('sortBy', encodeURIComponent(tableSorting[0].id));
            queryParams.set(
                'sortDirection',
                encodeURIComponent(tableSorting[0].desc ? 'desc' : 'asc'),
            );
        }

        void navigate({ search: queryParams.toString() }, { replace: true });
    }, [categories, search, tableSorting, navigate]);

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
                    subject('Explore', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                const canManageMetricsTree = user.data.ability.can(
                    'manage',
                    subject('MetricsTree', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                const canManageSpotlight = user.data.ability.can(
                    'manage',
                    subject('SpotlightTableConfig', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                dispatch(setUser({ userUuid: user.data.userUuid }));

                dispatch(
                    setAbility({
                        canManageTags,
                        canRefreshCatalog,
                        canManageExplore,
                        canManageMetricsTree,
                        canManageSpotlight,
                    }),
                );
            }
        },
        [user.data, dispatch, projectUuid],
    );

    useEffect(
        function openMetricExploreModal() {
            if (tableName && metricName) {
                dispatch(
                    toggleMetricExploreModal({
                        name: metricName,
                        tableName,
                    }),
                );
            }
        },
        [tableName, metricName, dispatch],
    );

    const headerButtonStyles: ButtonProps['style'] = {
        borderRadius: theme.radius.md,
        border: `1px solid ${theme.colors.ldGray[2]}`,
        padding: `${theme.spacing.xxs} 10px ${theme.spacing.xxs} ${theme.spacing.xs}`,
        fontSize: theme.fontSizes.sm,
        fontWeight: 500,
        color: theme.colors.ldGray[7],
    };

    return (
        <Stack w="100%" spacing="xxl">
            <Group position="apart">
                <Box>
                    <Group spacing="xs">
                        <Text color="ldGray.8" weight={600} size="xl">
                            Metrics Catalog
                        </Text>
                        <Tooltip
                            variant="xs"
                            label="This feature is in beta. We're actively testing and improving it—your feedback is welcome!"
                            position="right"
                        >
                            <Badge
                                variant="filled"
                                color="indigo.5"
                                radius={6}
                                size="md"
                                py="xxs"
                                px="xs"
                                sx={{
                                    cursor: 'default',
                                    boxShadow:
                                        '0px -2px 0px 0px rgba(4, 4, 4, 0.04) inset',
                                    '&:hover': {
                                        cursor: 'pointer',
                                    },
                                }}
                                onClick={() => {
                                    // @ts-ignore
                                    if (window.Pylon) {
                                        // @ts-ignore
                                        window.Pylon('show');
                                    } else {
                                        showIntercom();
                                    }
                                }}
                            >
                                Beta
                            </Badge>
                        </Tooltip>
                    </Group>
                    <Text color="ldGray.6" size="sm" weight={400}>
                        Browse all Metrics & KPIs across this project
                    </Text>
                </Box>
                <Group spacing="xs">
                    {isIndexingCatalog ? (
                        <Button
                            size="xs"
                            variant="default"
                            leftIcon={
                                <MantineIcon
                                    size="sm"
                                    color="ldGray.7"
                                    icon={IconRefresh}
                                />
                            }
                            loading={true}
                            style={headerButtonStyles}
                        >
                            Refreshing catalog
                        </Button>
                    ) : (
                        <RefreshDbtButton
                            leftIcon={
                                <MantineIcon
                                    size="sm"
                                    color="ldGray.7"
                                    icon={IconRefresh}
                                />
                            }
                            buttonStyles={headerButtonStyles}
                            defaultTextOverride={
                                lastDbtRefreshAt
                                    ? `Last refreshed ${timeAgo}`
                                    : 'Refresh catalog'
                            }
                            refreshingTextOverride="Refreshing catalog"
                        />
                    )}
                    <LearnMorePopover buttonStyles={headerButtonStyles} />
                </Group>
            </Group>
            <MetricsTable metricCatalogView={metricCatalogView} />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
