import { subject } from '@casl/ability';
import {
    Avatar,
    Box,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import MantineIcon from '../../../components/common/MantineIcon';
import RefreshDbtButton from '../../../components/RefreshDbtButton';
import { useProject } from '../../../hooks/useProject';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useApp } from '../../../providers/AppProvider';
import { MetricsCatalogIcon } from '../../../svgs/metricsCatalog';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    setAbility,
    setActiveMetric,
    setOrganizationUuid,
    setProjectUuid,
} from '../store/metricsCatalogSlice';
import { MetricChartUsageModal } from './MetricChartUsageModal';
import { MetricsTable } from './MetricsTable';

export const MetricsCatalogPanel = () => {
    const dispatch = useAppDispatch();
    const theme = useMantineTheme();
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
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

    useMount(() => {
        if (!projectUuid && params.projectUuid) {
            dispatch(setProjectUuid(params.projectUuid));
        }
    });

    useEffect(() => {
        if (!organizationUuid && project?.organizationUuid) {
            dispatch(setOrganizationUuid(project.organizationUuid));
        }
    }, [project, dispatch, organizationUuid]);

    useEffect(
        function handleManageTagsAbility() {
            if (user.data) {
                const canManageTags = user.data.ability.can(
                    'manage',
                    subject('Tags', {
                        organizationUuid: user.data.organizationUuid,
                        projectUuid,
                    }),
                );

                dispatch(setAbility({ canManageTags }));
            }
        },
        [user.data, dispatch, projectUuid],
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
                        <Text color="gray.8" weight={600} size="xl">
                            Metrics Catalog
                        </Text>
                        <Text color="gray.6" size="sm" weight={400}>
                            Browse all Metrics & KPIs across this project
                        </Text>
                    </Box>
                </Group>
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
            </Group>
            <MetricsTable />
            <MetricChartUsageModal
                opened={isMetricUsageModalOpen}
                onClose={onCloseMetricUsageModal}
            />
        </Stack>
    );
};
