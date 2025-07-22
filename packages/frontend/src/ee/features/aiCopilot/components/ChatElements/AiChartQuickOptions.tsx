import {
    type AiAgentMessageAssistant,
    type SavedChart,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartBar,
    IconDeviceFloppy,
    IconDots,
    IconExternalLink,
    IconTableShortcut,
} from '@tabler/icons-react';
import { Fragment, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useSavePromptQuery } from '../../hooks/useOrganizationAiAgents';
import { getOpenInExploreUrl } from '../../utils/getOpenInExploreUrl';

type Props = {
    projectUuid: string;
    saveChartOptions?: {
        name: string | null;
        description: string | null;
    };
    message: AiAgentMessageAssistant;
};

export const AiChartQuickOptions = ({
    projectUuid,
    saveChartOptions = { name: '', description: '' },
    message,
}: Props) => {
    const { track } = useTracking();
    const { user } = useApp();
    const { agentUuid } = useParams();

    const [opened, { open, close }] = useDisclosure(false);
    const {
        visualizationConfig,
        columnOrder,
        resultsData,
        chartConfig,
        pivotDimensions,
    } = useVisualizationContext();
    const { mutate: savePromptQuery } = useSavePromptQuery(
        agentUuid!,
        message.threadUuid,
        message.uuid,
    );
    const metricQuery = resultsData?.metricQuery;
    const type = chartConfig.type;

    const isDisabled = !metricQuery || !type || !visualizationConfig;
    const onSaveChart = (savedData: SavedChart) => {
        void savePromptQuery({ savedQueryUuid: savedData.uuid });
        if (
            user?.data?.userUuid &&
            user?.data?.organizationUuid &&
            projectUuid &&
            agentUuid &&
            metricQuery?.exploreName
        ) {
            track({
                name: EventName.AI_AGENT_CHART_CREATED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: agentUuid,
                    threadId: message.threadUuid,
                    messageId: message.uuid,
                    tableName: metricQuery.exploreName,
                },
            });
        }
        close();
    };

    const openInExploreUrl = useMemo(() => {
        if (isDisabled) return '';
        return getOpenInExploreUrl({
            metricQuery,
            projectUuid,
            columnOrder,
            chartConfig,
            pivotColumns: pivotDimensions,
        });
    }, [
        isDisabled,
        metricQuery,
        projectUuid,
        columnOrder,
        chartConfig,
        pivotDimensions,
    ]);

    const onClickExplore = () => {
        if (
            user?.data?.userUuid &&
            user?.data?.organizationUuid &&
            projectUuid &&
            agentUuid &&
            metricQuery?.exploreName
        ) {
            track({
                name: EventName.AI_AGENT_CHART_EXPLORED,
                properties: {
                    userId: user.data.userUuid,
                    organizationId: user.data.organizationUuid,
                    projectId: projectUuid,
                    aiAgentId: agentUuid,
                    threadId: message.threadUuid,
                    messageId: message.uuid,
                    tableName: metricQuery.exploreName,
                },
            });
        }
    };

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
                    {message.savedQueryUuid ? (
                        <Menu.Item
                            component={Link}
                            to={`/projects/${projectUuid}/saved/${message.savedQueryUuid}`}
                            target="_blank"
                            leftSection={
                                <MantineIcon icon={IconTableShortcut} />
                            }
                        >
                            View saved chart
                        </Menu.Item>
                    ) : (
                        <Menu.Item
                            onClick={() => open()}
                            leftSection={
                                <MantineIcon icon={IconDeviceFloppy} />
                            }
                        >
                            Save
                        </Menu.Item>
                    )}

                    <Menu.Item
                        component={Link}
                        to={openInExploreUrl}
                        target="_blank"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        disabled={isDisabled}
                        onClick={onClickExplore}
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
                    onConfirm={onSaveChart}
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
