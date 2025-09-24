
} from '@lightdash/common';
import { Accordion, Drawer, Text } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconChartBar, IconTools } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';

type Props = {
    isVisualizationAvailable: boolean;
    isDrawerOpen: boolean;

};

const AgentChatDebugDrawer: React.FC<Props> = ({
    isVisualizationAvailable,
    isDrawerOpen,

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
