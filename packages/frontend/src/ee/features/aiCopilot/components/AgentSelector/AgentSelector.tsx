import {
    Avatar,
    Center,
    Combobox,
    Group,
    Stack,
    Text,
    UnstyledButton,
    useCombobox,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconCirclePlus,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiRouterConfig } from '../../hooks/useAiRouter';
import styles from './AgentSelector.module.css';
import {
    AI_ROUTING_AUTO_VALUE,
    AI_ROUTING_SEARCH_PARAM,
    getAgentOptions,
    type Agent,
} from './AgentSelectorUtils';

type Props = {
    agents: Agent[];
    selectedAgent: Agent | 'auto';
    projectUuid: string;
    variant?: 'default' | 'header';
    /**
     * Render the target as an icon-only chip; the label reveals on hover,
     * focus, or while the dropdown is open. Used when toolbar space is
     * tight (e.g. the chat input).
     */
    compact?: boolean;
};

// The action belongs to the stable selector. Named agents are reusable options
// in the path, so renaming one never removes a control's walkthrough marker.
const viewAgentTourProps = {
    'data-tour-scope': 'view:AiAgent',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/ai-agents/:agentUuid',
    'data-tour-label': 'Open the agent dropdown',
    'data-tour-title': 'Explore an AI agent',
    'data-tour-docs':
        'agents/effective-analytics-with-agents.mdx#think-specialized-not-general:1',
    'data-tour-interactive': 'true',
    'data-tour-via': '[data-tour-nav="ask-ai"]',
    'data-tour-then':
        '[data-tour-anchor="agent-option"][data-tour-value="Jaffle analyst"]',
};

const AUTO_VALUE = '__auto__';
const DROPDOWN_MIN_WIDTH = 260;

export const AgentSelector = ({
    agents,
    selectedAgent,
    projectUuid,
    variant = 'default',
    compact = false,
}: Props) => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const [opened, setOpened] = useState(false);
    const combobox = useCombobox({
        onOpenedChange: setOpened,
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const agentOptions = getAgentOptions(agents);
    const isAuto = selectedAgent === 'auto';
    // Auto is only meaningful when there's more than one agent AND the router
    // is enabled. Treat any non-`enabled: true` state (loading, error, disabled)
    // as "no Auto" to avoid flashing the option in and out.
    const { data: aiRouterConfig } = useAiRouterConfig();
    const showAutoOption =
        agents.length > 1 && aiRouterConfig?.enabled === true;

    const handleOptionSubmit = (value: string) => {
        if (value === 'new') {
            void navigate(`/projects/${projectUuid}/ai-agents/new`, {
                viewTransition: true,
            });
        } else if (value === AUTO_VALUE) {
            const autoSearch = new URLSearchParams(search);
            autoSearch.set(AI_ROUTING_SEARCH_PARAM, AI_ROUTING_AUTO_VALUE);
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/ai-agents`,
                    search: autoSearch.toString(),
                },
                { viewTransition: true },
            );
        } else {
            const agentSearch = new URLSearchParams(search);
            agentSearch.delete(AI_ROUTING_SEARCH_PARAM);
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/ai-agents/${value}/threads`,
                    search: agentSearch.toString(),
                },
                {
                    viewTransition: true,
                },
            );
        }
        combobox.closeDropdown();
    };

    return (
        <Combobox
            store={combobox}
            onOptionSubmit={handleOptionSubmit}
            withinPortal
            width={compact ? 260 : 'target'}
            position="bottom-start"
        >
            <Combobox.Target>
                <UnstyledButton
                    {...viewAgentTourProps}
                    type="button"
                    onClick={() => combobox.toggleDropdown()}
                    // Anchor for scope walkthroughs (data-tour-via)
                    data-tour-anchor="agent-selector"
                    data-tour-hint="Open the agent dropdown"
                    className={`${styles.target} ${
                        compact ? styles.compact : ''
                    } ${variant === 'header' ? styles.headerTarget : ''}`}
                    data-open={opened ? 'true' : undefined}
                    data-auto={isAuto ? 'true' : undefined}
                >
                    <Group gap={6} wrap="nowrap" align="center" w="100%">
                        {!isAuto && (
                            <LightdashUserAvatar
                                size={22}
                                name={selectedAgent.name}
                                src={selectedAgent.imageUrl}
                            />
                        )}
                        <Text size="xs" truncate="end" className={styles.label}>
                            {isAuto ? 'Auto' : selectedAgent.name}
                        </Text>
                        <MantineIcon
                            icon={IconChevronDown}
                            size="sm"
                            color="dimmed"
                        />
                    </Group>
                </UnstyledButton>
            </Combobox.Target>

            <Combobox.Dropdown miw={DROPDOWN_MIN_WIDTH}>
                {showAutoOption && (
                    <Combobox.Header p={4} pr={6}>
                        <Combobox.Option value={AUTO_VALUE} p={2}>
                            <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                                <Avatar size={22} color="ldGray" radius="xl">
                                    <Text size="10px" fw={600} c="dimmed">
                                        AI
                                    </Text>
                                </Avatar>
                                <Stack gap={0} flex={1} miw={0}>
                                    <Text size="xs" fw={600}>
                                        Auto
                                    </Text>
                                    <Text size="xs" c="dimmed" truncate="end">
                                        We'll route to the best-fit agent
                                    </Text>
                                </Stack>
                                {isAuto && (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size="sm"
                                        color="ldGray.7"
                                    />
                                )}
                            </Group>
                        </Combobox.Option>
                    </Combobox.Header>
                )}
                <Combobox.Options>
                    {agentOptions.map((item) => (
                        <Combobox.Option
                            data-tour-anchor="agent-option"
                            data-tour-hint="Choose {value}"
                            data-tour-value={item.label}
                            value={item.value}
                            key={item.value}
                            p={2}
                            pr={6}
                        >
                            <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                                <LightdashUserAvatar
                                    size={22}
                                    name={item.label}
                                    src={item.imageUrl}
                                />

                                <Text size="xs" truncate="end" flex={1}>
                                    {item.label}
                                </Text>

                                {!isAuto &&
                                    item.value === selectedAgent.uuid && (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size="sm"
                                            color="ldGray.7"
                                        />
                                    )}
                            </Group>
                        </Combobox.Option>
                    ))}

                    <Combobox.Footer p={4} pr={6}>
                        <Combobox.Option
                            value="new"
                            p={2}
                            // Anchor for scope walkthroughs (data-tour-via),
                            // read first as a look at where agents start.
                            data-tour-anchor="agent-new"
                            data-tour-hint="Choose Create new agent"
                            data-tour-scope="manage:AiAgent"
                            data-tour-look="1"
                            data-tour-after='[data-tour-anchor="agent-selector"]'
                            data-tour-label="Every agent starts from this dropdown"
                            data-tour-docs="agents/set-up-agents.mdx#create-a-new-agent:1"
                        >
                            <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                                <Center w={22} h={22}>
                                    <MantineIcon
                                        icon={IconCirclePlus}
                                        size="sm"
                                    />
                                </Center>

                                <Text size="xs" truncate="end" flex={1}>
                                    Create new agent
                                </Text>
                            </Group>
                        </Combobox.Option>
                    </Combobox.Footer>
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
};
