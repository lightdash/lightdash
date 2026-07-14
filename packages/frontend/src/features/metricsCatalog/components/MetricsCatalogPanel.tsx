import { subject } from '@casl/ability';
import { CatalogCategoryFilterMode, isCompileJob } from '@lightdash/common';
import {
    Box,
    Group,
    Stack,
    Text,
    Button,
    type ButtonProps,
    ActionIcon,
} from '@mantine-8/core';
import { Popover, useMantineTheme } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import { IconRefresh, IconSparkles, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useProject } from '../../../hooks/useProject';
import { useAccount } from '../../../hooks/user/useAccount';
import useSearchParams from '../../../hooks/useSearchParams';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import useActiveJob from '../../../providers/ActiveJob/useActiveJob';
import { LearnMoreContent } from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import { useIndexCatalogJob } from '../hooks/useIndexCatalogJob';
import {
    setAbility,
    setActiveMetric,
    setCategoryFilterMode,
    setCategoryFilters,
    setOrganizationUuid,
    setOwnerFilters,
    setProjectUuid,
    setSearch,
    setTableFilters,
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
                    leftSection={<MantineIcon icon={IconSparkles} />}
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
                <Stack gap="sm" w="100%" ref={ref}>
                    <Group justify="space-between">
                        <Text fw={600} fz={14}>
                            ✨ Lightdash Spotlight is here!
                        </Text>
                        <ActionIcon
                            color="gray"
                            variant="transparent"
                            size="xs"
                            onClick={handleClose}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Group>
                    <LearnMoreContent width="100%" height="100%" />
                    <Text fz={13} c="ldGray.3">
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
                    <Group gap="xs">
                        <Button
                            variant="outline"
                            radius="md"
                            bg="ldDark.4"
                            c="ldGray.0"
                            hidden={true}
                            disabled={true}
                            style={{
                                display: 'none', // ! Disabled for now
                                border: 'none',
                                flexGrow: 1,
                            }}
                        >
                            View Demo
                        </Button>
                        <Button
                            component="a"
                            href="https://docs.lightdash.com/guides/metrics-catalog/"
                            target="_blank"
                            radius="md"
                            style={{ border: 'none', flexGrow: 1 }}
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
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const navigate = useNavigate();
    const categoriesParam = useSearchParams('categories');
    const categoriesFilterModeParam = useSearchParams('categoriesFilterMode');
    const tablesParam = useSearchParams('tables');
    const searchParam = useSearchParams('search');
    const sortingParam = useSearchParams('sortBy');
    const sortDirectionParam = useSearchParams('sortDirection');
    const ownerUserUuidParam = useSearchParams('ownerUserUuid');

    const categories = useAppSelector(
        (state) => state.metricsCatalog.categoryFilters,
    );
    const categoryFilterMode = useAppSelector(
        (state) => state.metricsCatalog.categoryFilterMode,
    );
    const tableFilters = useAppSelector(
        (state) => state.metricsCatalog.tableFilters,
    );
    const search = useAppSelector((state) => state.metricsCatalog.search);
    const tableSorting = useAppSelector(
        (state) => state.metricsCatalog.tableSorting,
    );
    const ownerFilters = useAppSelector(
        (state) => state.metricsCatalog.ownerFilters,
    );

    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );

    const [lastDbtRefreshAt, setLastDbtRefreshAt] = useState<
        Date | undefined
    >();
    const fallbackLastDbtRefreshAtRef = useRef(new Date());
    const timeAgo = useTimeAgo(
        lastDbtRefreshAt ?? fallbackLastDbtRefreshAtRef.current,
    );
    const params = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const { data: account } = useAccount();
    const { embedToken } = useEmbed();
    const isEmbed = !!embedToken;

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
        const urlCategoriesFilterMode =
            categoriesFilterModeParam === CatalogCategoryFilterMode.AND
                ? CatalogCategoryFilterMode.AND
                : CatalogCategoryFilterMode.OR;
        const urlTables = tablesParam?.split(',').map(decodeURIComponent) || [];
        const urlSearch = searchParam
            ? decodeURIComponent(searchParam)
            : undefined;
        const urlSortByParam = sortingParam
            ? decodeURIComponent(sortingParam)
            : undefined;
        const urlSortDirectionParam = sortDirectionParam
            ? decodeURIComponent(sortDirectionParam)
            : undefined;
        const urlOwnerUserUuids =
            ownerUserUuidParam?.split(',').map(decodeURIComponent) || [];

        dispatch(setCategoryFilters(urlCategories));
        dispatch(setCategoryFilterMode(urlCategoriesFilterMode));
        dispatch(setTableFilters(urlTables));
        dispatch(setOwnerFilters(urlOwnerUserUuids));
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
        categoriesFilterModeParam,
        tablesParam,
        ownerUserUuidParam,
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
            // Only include mode when categories selected and mode is not default (OR)
            if (categoryFilterMode === CatalogCategoryFilterMode.AND) {
                queryParams.set('categoriesFilterMode', categoryFilterMode);
            } else {
                queryParams.delete('categoriesFilterMode');
            }
        } else {
            queryParams.delete('categories');
            queryParams.delete('categoriesFilterMode');
        }

        if (tableFilters.length > 0) {
            queryParams.set(
                'tables',
                tableFilters.map(encodeURIComponent).join(','),
            );
        } else {
            queryParams.delete('tables');
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

        if (ownerFilters.length > 0) {
            queryParams.set(
                'ownerUserUuid',
                ownerFilters.map(encodeURIComponent).join(','),
            );
        } else {
            queryParams.delete('ownerUserUuid');
        }

        void navigate({ search: queryParams.toString() }, { replace: true });
    }, [
        categories,
        categoryFilterMode,
        tableFilters,
        ownerFilters,
        search,
        tableSorting,
        navigate,
    ]);

    useEffect(
        function handleAbilities() {
            if (account) {
                const organizationUuidFromAccount =
                    account.organization.organizationUuid;
                const canManageTags = account.user.ability.can(
                    'manage',
                    subject('Tags', {
                        organizationUuid: organizationUuidFromAccount,
                        projectUuid,
                    }),
                );

                const canRefreshCatalog =
                    !isEmbed &&
                    (account.user.ability.can('manage', 'Job') ||
                        account.user.ability.can('manage', 'CompileProject'));

                const canViewExplore = account.user.ability.can(
                    'view',
                    subject('Explore', {
                        organizationUuid: organizationUuidFromAccount,
                        projectUuid,
                    }),
                );
                const canManageExplore = account.user.ability.can(
                    'manage',
                    subject('Explore', {
                        organizationUuid: organizationUuidFromAccount,
                        projectUuid,
                    }),
                );

                const canManageMetricsTree =
                    !isEmbed &&
                    account.user.ability.can(
                        'manage',
                        subject('MetricsTree', {
                            organizationUuid: organizationUuidFromAccount,
                            projectUuid,
                        }),
                    );

                const canManageSpotlight =
                    !isEmbed &&
                    account.user.ability.can(
                        'manage',
                        subject('SpotlightTableConfig', {
                            organizationUuid: organizationUuidFromAccount,
                            projectUuid,
                        }),
                    );

                dispatch(setUser({ userUuid: account.user.id }));

                dispatch(
                    setAbility({
                        canManageTags,
                        canRefreshCatalog,
                        canManageExplore: canManageExplore || canViewExplore,
                        canManageMetricsTree,
                        canManageSpotlight,
                    }),
                );
            }
        },
        [account, dispatch, isEmbed, projectUuid],
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
        color:
            theme.colorScheme === 'dark'
                ? theme.colors.ldDark[9]
                : theme.colors.ldGray[7],
    };

    return (
        <Stack
            w="100%"
            h={isEmbed ? '100%' : undefined}
            mih={isEmbed ? 0 : undefined}
            gap={isEmbed ? 0 : 'xxl'}
        >
            <Group
                justify="space-between"
                style={{ display: isEmbed ? 'none' : undefined }}
            >
                <Box>
                    <Text c="ldGray.8" fw={600} size="xl">
                        Metrics Catalog
                    </Text>
                    <Text c="ldGray.6" size="sm" fw={400}>
                        Browse all Metrics & KPIs across this project
                    </Text>
                </Box>
                <Group gap="xs">
                    {isIndexingCatalog ? (
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={
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
            <MetricsTable
                metricCatalogView={metricCatalogView}
                isEmbed={isEmbed}
            />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
