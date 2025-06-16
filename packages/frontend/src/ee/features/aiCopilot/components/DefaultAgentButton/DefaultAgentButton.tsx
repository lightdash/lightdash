import {
    ActionIcon,
    type ActionIconProps,
    type MantineSize,
    Tooltip,
} from '@mantine-8/core';
import { IconStar } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDefaultAgent } from '../../hooks/useDefaultAgent';
import styles from './defaultAgentButton.module.css';

interface Props extends ActionIconProps {
    agentUuid: string;
    projectUuid?: string | null;
    size?: MantineSize;
}

export const DefaultAgentButton: React.FC<Props> = ({
    projectUuid,
    agentUuid,
    size = 'md',
    ...props
}) => {
    const { defaultAgentUuid, setDefaultAgentUuid } =
        useDefaultAgent(projectUuid);
    const isDefault = defaultAgentUuid === agentUuid;

    return (
        <Tooltip label={isDefault ? 'Default agent' : 'Set as default agent'}>
            <ActionIcon
                className={styles.button}
                radius="md"
                variant="subtle"
                color="gray"
                onClick={() => {
                    setDefaultAgentUuid(agentUuid);
                }}
                disabled={isDefault}
                size={size}
                {...props}
            >
                <MantineIcon
                    size={size}
                    icon={IconStar}
                    fill={isDefault ? 'yellow' : 'transparent'}
                    color={isDefault ? 'yellow' : 'gray'}
                />
            </ActionIcon>
        </Tooltip>
    );
};
