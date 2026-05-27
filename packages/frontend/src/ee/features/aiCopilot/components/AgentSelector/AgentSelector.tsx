import {
    Avatar,
    Center,
    Combobox,
    Group,
    InputBase,
    Stack,
    Text,
    useCombobox,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCirclePlus,
    IconSelector,
    IconSparkles,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiRouterConfig } from '../../hooks/useAiRouter';
import { getAgentOptions, type Agent } from './AgentSelectorUtils';

type Props = {
    agents: Agent[];
    selectedAgent: Agent | 'auto';
    projectUuid: string;
};

const AUTO_VALUE = '__auto__';

export const AgentSelector = ({
    agents,
    selectedAgent,
    projectUuid,
}: Props) => {
    const navigate = useNavigate();
    const { search } = useLocation();
    const combobox = useCombobox({
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
            void navigate(
                { pathname: `/projects/${projectUuid}/ai-agents`, search },
                { viewTransition: true },
            );
        } else {
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/ai-agents/${value}/threads`,
                    search,
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
        >
            <Combobox.Target>
                <InputBase
                    w="230px"
                    component="button"
                    type="button"
                    pointer
                    onClick={() => combobox.toggleDropdown()}
                    leftSection={
                        isAuto ? (
                            <Avatar size={22} color="violet" radius="xl">
                                <MantineIcon
                                    icon={IconSparkles}
                                    size="sm"
                                    color="violet.6"
                                />
                            </Avatar>
                        ) : (
                            <LightdashUserAvatar
                                size={22}
                                name={selectedAgent.name}
                                src={selectedAgent.imageUrl}
                            />
                        )
                    }
                    rightSection={<MantineIcon icon={IconSelector} />}
                    styles={(theme) => ({
                        input: {
                            borderColor: theme.colors.ldGray[2],
                            borderRadius: theme.radius.md,
                            boxShadow: `var(--mantine-shadow-subtle)`,
                            fontSize: theme.fontSizes.xs,
                        },
                    })}
                >
                    <Text size="xs" truncate="end" ml={2}>
                        {isAuto ? 'Auto' : selectedAgent.name}
                    </Text>
                </InputBase>
            </Combobox.Target>

            <Combobox.Dropdown>
                {showAutoOption && (
                    <Combobox.Header p={4} pr={6}>
                        <Combobox.Option value={AUTO_VALUE} p={2}>
                            <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                                <Avatar size={22} color="violet" radius="xl">
                                    <MantineIcon
                                        icon={IconSparkles}
                                        size="sm"
                                        color="violet.6"
                                    />
                                </Avatar>
                                <Stack gap={0} flex={1} miw={0}>
                                    <Text size="xs" fw={600} c="violet.7">
                                        Auto
                                    </Text>
                                    <Text size="xs" c="dimmed" truncate="end">
                                        Let AI pick the best agent
                                    </Text>
                                </Stack>
                                {isAuto && (
                                    <MantineIcon
                                        icon={IconCheck}
                                        size="sm"
                                        color="violet"
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
                                            color="violet"
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
