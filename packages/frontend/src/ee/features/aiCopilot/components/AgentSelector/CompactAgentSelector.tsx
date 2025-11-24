import {
    Avatar,
    Combobox,
    type ComboboxProps,
    Group,
    Tooltip,
    UnstyledButton,
    useCombobox,
} from '@mantine-8/core';
import { IconChevronDown } from '@tabler/icons-react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import Logo from '../../../../../svgs/logo-icon-round.svg?react';
import {
    type Agent,
    getAgentOptions,
    renderSelectOption,
} from './AgentSelectorUtils';

type Props = ComboboxProps & {
    agents: Agent[];
    selectedAgent: Agent;
    onSelect: (val: string) => void;
};

export const CompactAgentSelector = ({
    agents,
    selectedAgent,
    onSelect,
    ...props
}: Props) => {
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    const agentOptions = getAgentOptions(agents);
    const hasOneAgent = agentOptions.length === 1;
    const hasAgents = agentOptions.length > 0;

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
                    label={selectedAgent?.name}
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
                        disabled={hasOneAgent || !hasAgents}
                    >
                        <Group gap="two">
                            {hasAgents ? (
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

                            {!hasOneAgent && hasAgents && (
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
                {agentOptions.map((agent) => (
                    <Combobox.Option key={agent.value} value={agent.value}>
                        {renderSelectOption({
                            option: agent,
                            checked: agent.value === selectedAgent.uuid,
                        })}
                    </Combobox.Option>
                ))}
            </Combobox.Dropdown>
        </Combobox>
    );
};
