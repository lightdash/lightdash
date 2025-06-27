import { ActionIcon, Menu } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartBar,
    IconDeviceFloppy,
    IconDots,
    IconExternalLink,
} from '@tabler/icons-react';
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import { getOpenInExploreUrl } from '../../utils/getOpenInExploreUrl';

type Props = {
    projectUuid?: string;
    saveChartOptions?: {
        name: string | null;
        description: string | null;
    };
};

export const AiChartQuickOptions = ({
    projectUuid,
    saveChartOptions = { name: '', description: '' },
}: Props) => {
    const [opened, { open, close }] = useDisclosure(false);

    const { visualizationConfig, columnOrder, resultsData, chartConfig } =
        useVisualizationContext();
    const metricQuery = resultsData?.metricQuery;
    const type = chartConfig.type;
    const vizConfig = visualizationConfig;

    const isDisabled = !metricQuery || !type || !vizConfig;

    const openInExploreUrl = useMemo(() => {
        if (isDisabled) return '';
        return getOpenInExploreUrl({
            metricQuery,
            projectUuid,
            columnOrder,
            chartConfig,
            pivotColumns:
                vizConfig &&
                'breakdownByDimension' in vizConfig &&
                typeof vizConfig.breakdownByDimension === 'string'
                    ? [vizConfig.breakdownByDimension]
                    : undefined,
        });
    }, [
        isDisabled,
        metricQuery,
        projectUuid,
        columnOrder,
        chartConfig,
        vizConfig,
    ]);

    if (!metricQuery) return null;

    return (
        <Fragment>
            <Menu withArrow>
                <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="gray">
                        <MantineIcon icon={IconDots} size="lg" color="gray" />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Quick actions</Menu.Label>
                    <Menu.Item
                        onClick={() => open()}
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    >
                        Save
                    </Menu.Item>
                    <Menu.Item
                        component={Link}
                        to={openInExploreUrl}
                        target="_blank"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        disabled={isDisabled}
                    >
                        Explore from here
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <MantineModal
                opened={opened}
                onClose={close}
                title="Save chart"
                icon={IconChartBar}
                size="lg"
                modalBodyProps={{
                    px: 0,
                    py: 0,
                }}
                modalRootProps={{
                    closeOnClickOutside: false,
                }}
            >
                <SaveToSpaceOrDashboard
                    projectUuid={projectUuid}
                    savedData={{
                        metricQuery: metricQuery,
                        tableName: metricQuery.exploreName,
                        chartConfig,
                        tableConfig: { columnOrder },
                    }}
                    onConfirm={close}
                    onClose={close}
                    chartMetadata={{
                        name: saveChartOptions.name ?? '',
                        description: saveChartOptions.description ?? '',
                    }}
                    redirectOnSuccess={false}
                />
            </MantineModal>
        </Fragment>
    );
};
