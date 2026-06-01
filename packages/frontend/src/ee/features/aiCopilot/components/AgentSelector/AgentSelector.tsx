import {
    Avatar,
    Center,
    Combobox,
    Group,
    Stack,
    Text,
    UnstyledButton,
    useCombobox,
} from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconCirclePlus,
    IconSparkles,
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
    /**
     * Render the target as an icon-only chip; the label reveals on hover,
     * focus, or while the dropdown is open. Used when toolbar space is
     * tight (e.g. the chat input).
     */
    compact?: boolean;
};

const AUTO_VALUE = '__auto__';

export const AgentSelector = ({
    agents,
    selectedAgent,
    projectUuid,
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
            withinPortal={false}
            width={compact ? 260 : 'target'}
            position="bottom-start"
        >
            <Combobox.Target>
                <UnstyledButton
                    type="button"
                    onClick={() => combobox.toggleDropdown()}
                    className={`${styles.target} ${
                        compact ? styles.compact : ''
                    }`}
                    data-open={opened ? 'true' : undefined}
                >
                    <Group gap={6} wrap="nowrap" align="center" w="100%">
                        {isAuto ? (
                            <Avatar size={22} color="ldGray" radius="xl">
                                <MantineIcon
                                    icon={IconSparkles}
                                    size="sm"
                                    color="ldGray.6"
                                />
                            </Avatar>
                        ) : (
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
                            color="ldGray.6"
                        />
                    </Group>
                </UnstyledButton>
            </Combobox.Target>

            <Combobox.Dropdown>
                {showAutoOption && (
                    <Combobox.Header p={4} pr={6}>
                        <Combobox.Option value={AUTO_VALUE} p={2}>
                            <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                                <Avatar size={22} color="ldGray" radius="xl">
                                    <MantineIcon
                                        icon={IconSparkles}
                                        size="sm"
                                        color="ldGray.6"
                                    />
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
                        <Combobox.Option value="new" p={2}>
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
