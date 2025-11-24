import {
    Center,
    Combobox,
    Group,
    InputBase,
    Text,
    useCombobox,
} from '@mantine-8/core';
import { IconCheck, IconCirclePlus, IconSelector } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type Agent, getAgentOptions } from './AgentSelectorUtils';

type Props = {
    agents: Agent[];
    selectedAgent: Agent;
    projectUuid: string;
};

export const AgentSelector = ({
    agents,
    selectedAgent,
    projectUuid,
}: Props) => {
    const navigate = useNavigate();
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });

    const agentOptions = getAgentOptions(agents);

    const handleOptionSubmit = (value: string) => {
        if (value === 'new') {
            void navigate(`/projects/${projectUuid}/ai-agents/new`, {
                viewTransition: true,
            });
        } else {
            void navigate(`/projects/${projectUuid}/ai-agents/${value}`, {
                viewTransition: true,
            });
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
                        <LightdashUserAvatar
                            size={22}
                            name={selectedAgent.name}
                            src={selectedAgent.imageUrl}
                        />
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
                        {selectedAgent.name}
                    </Text>
                </InputBase>
            </Combobox.Target>

            <Combobox.Dropdown>
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

                                {item.value === selectedAgent.uuid && (
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
