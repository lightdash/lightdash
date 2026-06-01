import { type AiAgent } from '@lightdash/common';
import { Group, Text, type ComboboxItem } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';

export type Agent = Pick<AiAgent, 'name' | 'uuid' | 'imageUrl'>;

/**
 * Marks an explicit "Auto" selection on the `/ai-agents` index URL so it shows
 * the router even when the user has a default agent preference (which would
 * otherwise take precedence on an implicit landing).
 */
export const AI_ROUTING_SEARCH_PARAM = 'routing';
export const AI_ROUTING_AUTO_VALUE = 'auto';

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
            size={22}
            name={option.label}
            src={option.imageUrl}
        />
        <Text size="xs" truncate="end" flex={1}>
            {option.label}
        </Text>

        {checked && <MantineIcon icon={IconCheck} size="sm" color="violet" />}
    </Group>
);

export const getAgentOptions = (agents: Agent[]) =>
    agents.map(
        ({ name, uuid, imageUrl }) =>
            ({
                label: name,
                value: uuid,
                imageUrl: imageUrl,
            }) satisfies AgentSelectOption,
    );
