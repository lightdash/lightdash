import { subject } from '@casl/ability';
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
import { useHistory } from 'react-router-dom';
import { useParams } from 'react-router-dom-v5-compat';
import { useIntercom } from 'react-use-intercom';
import MantineIcon from '../../../components/common/MantineIcon';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useProject } from '../../../hooks/useProject';
import useSearchParams from '../../../hooks/useSearchParams';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useApp } from '../../../providers/AppProvider';
import { LearnMoreContent } from '../../../svgs/metricsCatalog';
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
import { MetricsTable } from './MetricsTable';

const LOCAL_STORAGE_KEY = 'metrics-catalog-learn-more-popover-closed';

const LearnMorePopover: FC<{ buttonStyles?: ButtonProps['sx'] }> = ({
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
        >
            <Popover.Target>
                <Button
                    ref={buttonRef}
                    size="xs"
                    variant="default"
                    leftIcon={<MantineIcon icon={IconSparkles} />}
                    sx={buttonStyles}
                    onClick={opened ? handleClose : open}
                >
                    Learn more
                </Button>
            </Popover.Target>
            <Popover.Dropdown
                bg="dark.6"
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
                    <Text size={13} c="gray.3">
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
                            bg="dark.4"
                            c="gray.0"
                            hidden={true}
                            disabled={true}
                            sx={(theme) => ({
                                display: 'none', // ! Disabled for now
                                border: 'none',
                                flexGrow: 1,
                                '&:hover': {
                                    backgroundColor: theme.colors.dark[5],
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

export const MetricsCatalogPanel = () => {
    const dispatch = useAppDispatch();
    const theme = useMantineTheme();
    const { show: showIntercom } = useIntercom();
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

    const headerButtonStyles: ButtonProps['sx'] = {
        borderRadius: theme.radius.md,
        backgroundColor: '#FAFAFA',
        border: `1px solid ${theme.colors.gray[2]}`,
        padding: `${theme.spacing.xxs} 10px ${theme.spacing.xxs} ${theme.spacing.xs}`,
        fontSize: theme.fontSizes.sm,
        fontWeight: 500,
        color: theme.colors.gray[7],
    };

    return (
        <Stack w="100%" spacing="xxl">
            <Group position="apart">
                <Box>
                    <Group spacing="xs">
                        <Text color="gray.8" weight={600} size="xl">
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
                    <Text color="gray.6" size="sm" weight={400}>
                        Browse all Metrics & KPIs across this project
                    </Text>
                </Box>
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
                        buttonStyles={headerButtonStyles}
                        defaultTextOverride={
                            lastDbtRefreshAt
                                ? `Last refreshed ${timeAgo}`
                                : 'Refresh catalog'
                        }
                        refreshingTextOverride="Refreshing catalog"
                    />
                    <LearnMorePopover buttonStyles={headerButtonStyles} />
                </Group>
            </Group>
            <MetricsTable />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
