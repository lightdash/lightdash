import { Combobox, Group, UnstyledButton, useCombobox } from '@mantine-8/core';
import { IconChevronDown } from '@tabler/icons-react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    type Agent,
    getAgentOptions,
    renderSelectOption,
} from './AgentSelectorUtils';

type Props = {
    agents: Agent[];
    selectedAgent: Agent;
    onSelect: (val: string) => void;
};

export const CompactAgentSelector = ({
    agents,
    selectedAgent,
    onSelect,
}: Props) => {
    const combobox = useCombobox({
        onDropdownClose: () => combobox.resetSelectedOption(),
    });
    const agentOptions = getAgentOptions(agents);

    return (
        <Combobox
            store={combobox}
            width={230}
            position="bottom-start"
            onOptionSubmit={(val) => {
                onSelect(val);
                combobox.closeDropdown();
            }}
        >
            <Combobox.Target>
                <UnstyledButton
                    onClick={() => combobox.toggleDropdown()}
                    variant="light"
                    color="gray"
                    p={0}
                >
                    <Group gap="xxs">
                        <LightdashUserAvatar
                            size="md"
                            variant="filled"
                            name={selectedAgent.name}
                            src={selectedAgent.imageUrl}
                        />
                        <MantineIcon icon={IconChevronDown} />
                    </Group>
                </UnstyledButton>
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
