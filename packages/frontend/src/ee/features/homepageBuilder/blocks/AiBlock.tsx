import {
    ActionIcon,
    Badge,
    Card,
    Group,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import AiSearchBox from '../../../components/Home/AiSearchBox';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
} from '../../aiCopilot/components/AgentSelector/AgentSelectorUtils';
import { usePendingPrompt } from '../../aiCopilot/components/PendingPromptContext/PendingPromptContext';
import { useAiAgentButtonVisibility } from '../../aiCopilot/hooks/useAiAgentsButtonVisibility';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const SuggestionChips: FC<{ chips: string[]; projectUuid: string }> = ({
    chips,
    projectUuid,
}) => {
    const navigate = useNavigate();
    const { setPendingPrompt } = usePendingPrompt();
    if (chips.length === 0) return null;
    return (
        <Group gap={6} mt={13}>
            {chips.map((chip) => (
                <button
                    key={chip}
                    type="button"
                    className={classes.aiChip}
                    onClick={() => {
                        setPendingPrompt(chip);
                        void navigate(
                            {
                                pathname: `/projects/${projectUuid}/ai-agents`,
                                search: new URLSearchParams({
                                    [AI_ROUTING_SEARCH_PARAM]:
                                        AI_ROUTING_AUTO_VALUE,
                                }).toString(),
                            },
                            {
                                state: { autoSubmitPrompt: chip },
                                viewTransition: true,
                            },
                        );
                    }}
                >
                    {chip}
                </button>
            ))}
        </Group>
    );
};

export const AiBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const isAiEnabled = useAiAgentButtonVisibility();
    if (block.type !== 'ai' || !isAiEnabled) return null;
    return (
        <Stack gap={0}>
            <AiSearchBox projectUuid={projectUuid} />
            <SuggestionChips
                chips={block.config.chips}
                projectUuid={projectUuid}
            />
        </Stack>
    );
};

export const AiBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const [newChip, setNewChip] = useState('');
    if (block.type !== 'ai') return null;

    const addChip = () => {
        const chip = newChip.trim();
        if (!chip || block.config.chips.includes(chip)) return;
        onChange({
            ...block,
            config: { chips: [...block.config.chips, chip] },
        });
        setNewChip('');
    };

    return (
        <Stack gap="xs">
            <AiSearchBox projectUuid={projectUuid} />
            <Card withBorder p="sm">
                <Stack gap="xs">
                    <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                        Suggestion chips
                    </Text>
                    <Group gap="xs">
                        {block.config.chips.map((chip) => (
                            <Badge
                                key={chip}
                                variant="default"
                                size="lg"
                                radius="sm"
                                tt="none"
                                fw={500}
                                rightSection={
                                    <ActionIcon
                                        variant="transparent"
                                        color="gray"
                                        size="xs"
                                        aria-label={`Remove suggestion ${chip}`}
                                        onClick={() =>
                                            onChange({
                                                ...block,
                                                config: {
                                                    chips: block.config.chips.filter(
                                                        (c) => c !== chip,
                                                    ),
                                                },
                                            })
                                        }
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                }
                            >
                                {chip}
                            </Badge>
                        ))}
                    </Group>
                    <Group gap="xs">
                        <TextInput
                            placeholder="e.g. What drove revenue last month?"
                            size="xs"
                            style={{ flex: 1 }}
                            value={newChip}
                            onChange={(e) => setNewChip(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addChip();
                                }
                            }}
                        />
                        <ActionIcon
                            variant="default"
                            aria-label="Add suggestion"
                            onClick={addChip}
                        >
                            <MantineIcon icon={IconPlus} />
                        </ActionIcon>
                    </Group>
                    <Text size="xs" c="dimmed">
                        Chips are curated for this audience — clicking one asks
                        the AI agent.
                    </Text>
                </Stack>
            </Card>
        </Stack>
    );
};
