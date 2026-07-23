import { type AiMcpServer } from '@lightdash/common';
import { Box, Group, Radio, SimpleGrid, Stack, Text } from '@mantine-8/core';
import { IconDatabase } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { DEEP_RESEARCH_DEPTH_CONFIG } from '../../deepResearch/runProgress';
import {
    DEEP_RESEARCH_DEPTHS,
    type DeepResearchDepth,
} from '../../deepResearch/types';
import { DeepResearchMcpSelector } from './DeepResearchMcpSelector';
import styles from './DeepResearchPreflight.module.css';

type Props = {
    depth: DeepResearchDepth;
    onDepthChange: (depth: DeepResearchDepth) => void;
    mcpServers: AiMcpServer[];
    selectedMcpServerUuids: string[];
    onSelectedMcpServerUuidsChange: (mcpServerUuids: string[]) => void;
    isLoadingMcpServers: boolean;
    mcpServerError: string | null;
};

export const DeepResearchPreflight = ({
    depth,
    onDepthChange,
    mcpServers,
    selectedMcpServerUuids,
    onSelectedMcpServerUuidsChange,
    isLoadingMcpServers,
    mcpServerError,
}: Props) => {
    return (
        <Box
            className={styles.root}
            role="region"
            aria-label="Deep research settings"
        >
            <Stack gap="md">
                <Stack gap={2}>
                    <Text size="13px" fw={600} lh={1.35}>
                        Research depth
                    </Text>
                    <Text size="11px" c="dimmed" lh={1.4}>
                        Runs in the background. You can safely leave this page.
                    </Text>
                </Stack>

                <Radio.Group
                    value={depth}
                    onChange={(value) =>
                        onDepthChange(value as DeepResearchDepth)
                    }
                    aria-label="Research depth"
                >
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                        {DEEP_RESEARCH_DEPTHS.map((option) => {
                            const optionConfig =
                                DEEP_RESEARCH_DEPTH_CONFIG[option];
                            return (
                                <Radio.Card
                                    key={option}
                                    value={option}
                                    className={styles.depthCard}
                                    radius="md"
                                    p="xs"
                                >
                                    <Group
                                        wrap="nowrap"
                                        gap="xs"
                                        align="center"
                                    >
                                        <Radio.Indicator size="xs" />
                                        <Stack gap={0}>
                                            <Text size="12px" fw={600} lh={1.3}>
                                                {optionConfig.label}
                                            </Text>
                                            <Stack gap={5} mt={6}>
                                                <Group gap={3} wrap="nowrap">
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                        size={10}
                                                    />
                                                    <Text
                                                        size="10px"
                                                        c="dimmed"
                                                        lh={1.3}
                                                    >
                                                        Up to{' '}
                                                        {
                                                            optionConfig.warehouseQueries
                                                        }{' '}
                                                        queries
                                                    </Text>
                                                </Group>
                                            </Stack>
                                        </Stack>
                                    </Group>
                                </Radio.Card>
                            );
                        })}
                    </SimpleGrid>
                </Radio.Group>

                <DeepResearchMcpSelector
                    mcpServers={mcpServers}
                    selectedMcpServerUuids={selectedMcpServerUuids}
                    onSelectedMcpServerUuidsChange={
                        onSelectedMcpServerUuidsChange
                    }
                    isLoading={isLoadingMcpServers}
                    error={mcpServerError}
                />
            </Stack>
        </Box>
    );
};
