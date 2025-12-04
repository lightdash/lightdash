import {
    type AiAgentMessageAssistant,
    type AiArtifact,
    type SavedChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChartBar,
    IconCircleCheck,
    IconCircleCheckFilled,
    IconDeviceFloppy,
    IconDots,
    IconExternalLink,
    IconTableShortcut,
    IconTerminal2,
} from '@tabler/icons-react';
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { SaveToSpaceOrDashboard } from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard';
import { useVisualizationContext } from '../../../../../components/LightdashVisualization/useVisualizationContext';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { useSetArtifactVersionVerified } from '../../hooks/useAiAgentArtifacts';
import { useAiAgentPermission } from '../../hooks/useAiAgentPermission';
import { useSavePromptQuery } from '../../hooks/useProjectAiAgents';
import { getOpenInExploreUrl } from '../../utils/getOpenInExploreUrl';

type Props = {
    projectUuid: string;
    agentUuid: string;
    saveChartOptions?: {
        name: string | null;
        description: string | null;
        linkToMessage: boolean;
    };
    message: AiAgentMessageAssistant;
    compiledSql?: string;
    artifactData?: AiArtifact;
};

export const AiChartQuickOptions = ({
    projectUuid,
    agentUuid,
    saveChartOptions = { name: '', description: '', linkToMessage: true },
    message,
    compiledSql,
    artifactData,
}: Props) => {
    const { track } = useTracking();
    const { user } = useApp();

    const [opened, { open, close }] = useDisclosure(false);
    const [
        verifyModalOpened,
        { open: openVerifyModal, close: closeVerifyModal },
    ] = useDisclosure(false);
    const {
        visualizationConfig,
        columnOrder,
        resultsData,
        chartConfig,
        pivotDimensions,
    } = useVisualizationContext();
    const { mutate: savePromptQuery } = useSavePromptQuery(
        projectUuid,
        agentUuid!,
        message.threadUuid,
        message.uuid,
    );
    const { mutate: setVerified } = useSetArtifactVersionVerified(
        projectUuid,
        agentUuid!,
    );
    const canManageAgent = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });
    const metricQuery = resultsData?.metricQuery;
    const type = chartConfig.type;

    const isVerified = artifactData?.verifiedByUserUuid !== null;

    const isDisabled = !metricQuery || !type || !visualizationConfig;
    const onSaveChart = (savedData: SavedChart) => {
        if (!saveChartOptions.linkToMessage) {
            close();
            return;
        }
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

    const handleVerifyToggle = () => {
        if (!artifactData) return;

        if (isVerified) {
            openVerifyModal();
        } else {
            setVerified({
                artifactUuid: artifactData.artifactUuid,
                versionUuid: artifactData.versionUuid,
                verified: true,
            });
        }
    };

    const handleConfirmUnverify = () => {
        if (!artifactData) return;
        setVerified({
            artifactUuid: artifactData.artifactUuid,
            versionUuid: artifactData.versionUuid,
            verified: false,
        });
        closeVerifyModal();
    };

    if (!metricQuery) return null;

    return (
        <Fragment>
            {artifactData && canManageAgent && (
                <Tooltip
                    label={
                        isVerified
                            ? 'Remove from verified answers'
                            : 'Add to verified answers'
                    }
                >
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color={isVerified ? 'green' : 'ldGray.9'}
                        onClick={handleVerifyToggle}
                    >
                        <MantineIcon
                            icon={
                                isVerified
                                    ? IconCircleCheckFilled
                                    : IconCircleCheck
                            }
                            size="lg"
                        />
                    </ActionIcon>
                </Tooltip>
            )}
            <Menu withArrow>
                <Menu.Target>
                    <ActionIcon size="sm" variant="subtle" color="ldGray.9">
                        <MantineIcon icon={IconDots} size="lg" />
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

                    {!!compiledSql ? (
                        <Menu.Item
                            component={Link}
                            to={{
                                pathname: `/projects/${projectUuid}/sql-runner`,
                            }}
                            state={{ sql: compiledSql }}
                            leftSection={<MantineIcon icon={IconTerminal2} />}
                        >
                            Open in SQL Runner
                        </Menu.Item>
                    ) : null}
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
            <MantineModal
                opened={verifyModalOpened}
                onClose={closeVerifyModal}
                title="Remove from verified answers"
                icon={IconCircleCheck}
                size="sm"
                actions={
                    <Group gap="sm">
                        <Button variant="default" onClick={closeVerifyModal}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={handleConfirmUnverify}>
                            Confirm
                        </Button>
                    </Group>
                }
            >
                <Text>
                    Are you sure you want to remove this answer from verified
                    answers? It will no longer be used as an example in future
                    Agent responses.
                </Text>
            </MantineModal>
        </Fragment>
    );
};
