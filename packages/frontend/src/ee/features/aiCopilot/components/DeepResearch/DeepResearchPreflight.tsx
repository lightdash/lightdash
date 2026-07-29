import { type AiMcpServer } from '@lightdash/common';
import {
    Box,
    Divider,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type KeyboardEvent } from 'react';
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
    const handleDepthKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        optionIndex: number,
    ) => {
        const getNextIndex = () => {
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowRight':
                    return (optionIndex + 1) % DEEP_RESEARCH_DEPTHS.length;
                case 'ArrowUp':
                case 'ArrowLeft':
                    return (
                        (optionIndex - 1 + DEEP_RESEARCH_DEPTHS.length) %
                        DEEP_RESEARCH_DEPTHS.length
                    );
                case 'Home':
                    return 0;
                case 'End':
                    return DEEP_RESEARCH_DEPTHS.length - 1;
                default:
                    return null;
            }
        };

        const nextIndex = getNextIndex();
        if (nextIndex === null) {
            return;
        }

        event.preventDefault();
        onDepthChange(DEEP_RESEARCH_DEPTHS[nextIndex]);
        event.currentTarget
            .closest('[role="radiogroup"]')
            ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
            [nextIndex]?.focus();
    };

    return (
        <Box
            className={styles.root}
            role="region"
            aria-label="Deep research settings"
        >
            <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed">
                    Depth
                </Text>
                <Stack gap={2} role="radiogroup" aria-label="Research depth">
                    {DEEP_RESEARCH_DEPTHS.map((option, optionIndex) => {
                        const optionConfig = DEEP_RESEARCH_DEPTH_CONFIG[option];
                        const isSelected = option === depth;
                        return (
                            <UnstyledButton
                                key={option}
                                className={styles.listOption}
                                onClick={() => onDepthChange(option)}
                                onKeyDown={(event) =>
                                    handleDepthKeyDown(event, optionIndex)
                                }
                                role="radio"
                                aria-checked={isSelected}
                                tabIndex={isSelected ? 0 : -1}
                            >
                                <Group justify="space-between" wrap="nowrap">
                                    <Stack gap={0}>
                                        <Text size="sm" fw={500}>
                                            {optionConfig.label}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Up to{' '}
                                            {optionConfig.warehouseQueries}{' '}
                                            queries
                                        </Text>
                                    </Stack>
                                    {isSelected && (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size="sm"
                                            color="ldGray.7"
                                        />
                                    )}
                                </Group>
                            </UnstyledButton>
                        );
                    })}
                </Stack>

                <Divider my={4} />

                <Text size="xs" fw={600} c="dimmed">
                    MCP
                </Text>
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
