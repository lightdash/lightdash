import { Select } from '@mantine-8/core';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import {
    type Agent,
    getAgentOptions,
    renderSelectOption,
} from './AgentSelectorUtils';

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
    const handleSelect = (value: string | null) => {
        if (value)
            void navigate(`/projects/${projectUuid}/ai-agents/${value}`, {
                viewTransition: true,
            });
    };
    const agentOptions = getAgentOptions(agents);

    return (
        <Select
            data={agentOptions}
            value={selectedAgent.uuid}
            onChange={handleSelect}
            checkIconPosition="right"
            w="100%"
            allowDeselect={false}
            renderOption={renderSelectOption}
            withScrollArea={false}
            leftSection={
                <LightdashUserAvatar
                    size={22}
                    variant="filled"
                    name={selectedAgent.name}
                    src={selectedAgent.imageUrl}
                />
            }
            styles={(theme) => ({
                input: {
                    borderColor: theme.colors.gray[2],
                    boxShadow: `var(--mantine-shadow-subtle)`,
                    color: theme.colors.gray[7],
                },
                dropdown: {
                    paddingRight: 4,
                },
            })}
        />
    );
};
