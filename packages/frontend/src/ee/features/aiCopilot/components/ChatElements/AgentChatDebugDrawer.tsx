import type {
    AiArtifact,
    ApiAiAgentThreadMessageVizQuery,
} from '@lightdash/common';
import { Accordion, Drawer, Text } from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import { IconChartBar, IconMathFunction, IconTools } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';

type Props = {
    isVisualizationAvailable: boolean;
    isDrawerOpen: boolean;
    closeDrawer: () => void;
    _artifactData: AiArtifact | null;
    vizQueryData: ApiAiAgentThreadMessageVizQuery | null;
    echartsConfig: object | null;
    toolCalls: object | null;
};

const AgentChatDebugDrawer = ({
    isVisualizationAvailable,
    isDrawerOpen,
    closeDrawer,
    _artifactData,
    vizQueryData,
    echartsConfig,
    toolCalls,
}: Props) => {
    return (
        <Drawer
            title="Debug information"
            opened={isVisualizationAvailable && isDrawerOpen}
            onClose={closeDrawer}
            size="xl"
        >
            <Accordion variant="contained" chevronPosition="right">
                <Accordion.Item value="metric-query">
                    <Accordion.Control
                        icon={
                            <MantineIcon icon={IconMathFunction} color="gray" />
                        }
                    >
                        <Text fw={500}>Metric Query</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Prism language="json" withLineNumbers>
                            {JSON.stringify(
                                vizQueryData?.query.metricQuery ?? null,
                                null,
                                2,
                            )}
                        </Prism>
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="visualization">
                    <Accordion.Control
                        icon={<MantineIcon icon={IconChartBar} color="gray" />}
                    >
                        <Text fw={500}>ECharts Configuration</Text>
                    </Accordion.Control>
                    <Accordion.Panel>
                        <Prism language="json" withLineNumbers>
                            {JSON.stringify(echartsConfig, null, 2)}
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
