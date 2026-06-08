import {
    Avatar,
    Combobox,
    Group,
    Text,
    Tooltip,
    UnstyledButton,
    useCombobox,
    type ComboboxProps,
} from '@mantine-8/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import Logo from '../../../../../svgs/logo-icon-round.svg?react';
import {
    AI_ROUTING_AUTO_VALUE,
    getAgentOptions,
    renderSelectOption,
    type Agent,
} from './AgentSelectorUtils';

type Props = ComboboxProps & {
    agents: Agent[];
    selectedAgent: Agent | 'auto';
    onSelect: (val: string) => void;
    showAutoOption?: boolean;
};

export const CompactAgentSelector = ({
    agents,
    selectedAgent,
    onSelect,
    showAutoOption = false,
    ...props
}: Props) => {
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    const agentOptions = getAgentOptions(agents);
    const isAuto = selectedAgent === 'auto';
    const hasOneOption = agentOptions.length + (showAutoOption ? 1 : 0) === 1;
    const hasAgents = agentOptions.length > 0;
    const tooltipLabel = isAuto ? 'Auto' : selectedAgent?.name;

    return (
        <Combobox
            {...props}
            store={combobox}
            width={230}
            position="bottom-start"
            onOptionSubmit={(val) => {
                onSelect(val);
                combobox.closeDropdown();
            }}
        >
            <Combobox.Target>
                <Tooltip
                    label={tooltipLabel}
                    withArrow
                    withinPortal
                    fz="xs"
                    fw={500}
                    disabled={!hasAgents}
                >
                    <UnstyledButton
                        onClick={() => combobox.toggleDropdown()}
                        variant="light"
                        color="gray"
                        p={0}
                        disabled={hasOneOption || !hasAgents}
                    >
                        <Group gap="two">
                            {isAuto ? (
                                <Avatar size="md" color="ldGray" radius="xl">
                                    <Text size="xs" fw={700} c="ldGray.6">
                                        AI
                                    </Text>
                                </Avatar>
                            ) : hasAgents ? (
                                <LightdashUserAvatar
                                    size="md"
                                    name={selectedAgent.name}
                                    src={selectedAgent.imageUrl}
                                />
                            ) : (
                                <Avatar radius="xl" size="md">
                                    <Logo />
                                </Avatar>
                            )}

                            {!hasOneOption && hasAgents && (
                                <MantineIcon
                                    icon={IconChevronDown}
                                    color="ldGray.6"
                                    strokeWidth={1.5}
                                />
                            )}
                        </Group>
                    </UnstyledButton>
                </Tooltip>
            </Combobox.Target>

            <Combobox.Dropdown>
                {showAutoOption && (
                    <Combobox.Option value={AI_ROUTING_AUTO_VALUE}>
                        <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
                            <Avatar size={22} color="ldGray" radius="xl">
                                <Text size="10px" fw={700} c="ldGray.6">
                                    AI
                                </Text>
                            </Avatar>
                            <Text size="xs" truncate="end" flex={1}>
                                Auto
                            </Text>
                            {isAuto && (
                                <MantineIcon
                                    icon={IconCheck}
                                    size="sm"
                                    color="violet"
                                />
                            )}
                        </Group>
                    </Combobox.Option>
                )}
                {agentOptions.map((agent) => (
                    <Combobox.Option key={agent.value} value={agent.value}>
                        {renderSelectOption({
                            option: agent,
                            checked:
                                !isAuto && agent.value === selectedAgent.uuid,
                        })}
                    </Combobox.Option>
                ))}
            </Combobox.Dropdown>
        </Combobox>
    );
};
