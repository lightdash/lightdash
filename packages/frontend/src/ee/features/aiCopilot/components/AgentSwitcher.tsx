import { type AiAgent } from '@lightdash/common';
import { type ComboboxItem, Group, Select, Text } from '@mantine-8/core';
import { IconPointFilled } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import { LightdashUserAvatar } from '../../../../components/Avatar';
import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    agents: Pick<AiAgent, 'name' | 'uuid' | 'imageUrl'>[];
    selectedAgent: AiAgent;
    projectUuid: string;
};

interface AgentSelectOption extends ComboboxItem {
    imageUrl?: AiAgent['imageUrl'];
}

const renderSelectOption = ({
    option,
    checked,
}: {
    option: AgentSelectOption;
    checked?: boolean;
}) => (
    <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
        <LightdashUserAvatar
            size={20}
            variant="filled"
            name={option.label}
            src={option.imageUrl}
        />
        <Text size="xs" truncate="end" flex={1}>
            {option.label}
        </Text>

        {checked && <MantineIcon icon={IconPointFilled} size={12} />}
    </Group>
);

export const AgentSwitcher = ({
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
    const agentOptions = agents.map(
        ({ name, uuid, imageUrl }) =>
            ({
                label: name,
                value: uuid,
                imageUrl: imageUrl,
            } satisfies AgentSelectOption),
    );

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
