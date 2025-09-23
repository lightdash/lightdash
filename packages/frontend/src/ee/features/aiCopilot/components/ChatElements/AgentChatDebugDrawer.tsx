import {
    type AiAgentMessageAssistantArtifact,
    type AiAgentToolCall,
} from '@lightdash/common';
import { Accordion, Drawer, Text } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconChartBar, IconTools } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';

type Props = {
    isVisualizationAvailable: boolean;
    isDrawerOpen: boolean;
    onClose: () => void;
    artifacts: AiAgentMessageAssistantArtifact[] | null;
    toolCalls: AiAgentToolCall[] | null;
    agentUuid: string;
    projectUuid: string;
};

const AgentChatDebugDrawer: React.FC<Props> = ({
    isVisualizationAvailable,
    isDrawerOpen,
    onClose,
    artifacts,
    toolCalls,
    agentUuid,
    projectUuid,
}) => {
    const artifact = artifacts?.[artifacts.length - 1];

    const { data: artifactData } = useAiAgentArtifact({
        projectUuid: projectUuid,
        agentUuid: agentUuid,
        artifactUuid: artifact?.artifactUuid,
        versionUuid: artifact?.versionUuid,
    });

    return (
        <Drawer
            title="Debug information"
            opened={isVisualizationAvailable && isDrawerOpen}
            onClose={onClose}
            size="xl"
        >
            <Accordion variant="contained" chevronPosition="right">
                <Accordion.Item value="visualization">
                    <Accordion.Control
                        icon={<MantineIcon icon={IconChartBar} color="gray" />}
                    >
                        <Text fw={500}>
                            Configuration for {artifactData?.artifactType}
                        </Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Prism language="json" withLineNumbers>
                            {JSON.stringify(
                                artifactData?.chartConfig ??
                                    artifactData?.dashboardConfig,
                                null,
                                2,
                            )}
                        </Prism>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="tool-calls">
                    <Accordion.Control
                        icon={<MantineIcon icon={IconTools} color="gray" />}
                    >
                        <Text fw={500}>Tool calls</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Prism language="json" withLineNumbers>
                            {JSON.stringify(toolCalls, null, 2)}
                        </Prism>
                    </Accordion.Panel>
                </Accordion.Item>
            </Accordion>
        </Drawer>
    );
};

export default AgentChatDebugDrawer;
