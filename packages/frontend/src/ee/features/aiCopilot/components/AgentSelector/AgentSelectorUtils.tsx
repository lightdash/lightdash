import { type AiAgent } from '@lightdash/common';
import { type ComboboxItem, Group, Text } from '@mantine-8/core';
import { IconPointFilled } from '@tabler/icons-react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type Agent = Pick<AiAgent, 'name' | 'uuid' | 'imageUrl'>;

export interface AgentSelectOption extends ComboboxItem {
    imageUrl?: AiAgent['imageUrl'];
}

export const renderSelectOption = ({
    option,
    checked,
}: {
    option: AgentSelectOption;
    checked?: boolean;
}) => (
    <Group gap="xs" wrap="nowrap" miw={0} flex={1}>
        <LightdashUserAvatar
            size={20}
            name={option.label}
            src={option.imageUrl}
        />
        <Text size="xs" truncate="end" flex={1}>
            {option.label}
        </Text>

        {checked && <MantineIcon icon={IconPointFilled} size={12} />}
    </Group>
);

export const getAgentOptions = (agents: Agent[]) =>
    agents.map(
        ({ name, uuid, imageUrl }) =>
            ({
                label: name,
                value: uuid,
                imageUrl: imageUrl,
            } satisfies AgentSelectOption),
    );
