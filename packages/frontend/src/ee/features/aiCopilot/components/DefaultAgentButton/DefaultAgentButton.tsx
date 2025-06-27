import {
    ActionIcon,
    type ActionIconProps,
    type MantineSize,
    Tooltip,
} from '@mantine-8/core';
import { IconStar } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useGetUserAgentPreferences,
    useUpdateUserAgentPreferences,
} from '../../hooks/useUserAgentPreferences';
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
    const { data: userAgentPreferences } =
        useGetUserAgentPreferences(projectUuid);
    const { mutateAsync: setDefaultAgentUuid } = useUpdateUserAgentPreferences(
        projectUuid!,
    );

    const isDefault = userAgentPreferences?.defaultAgentUuid === agentUuid;

    return (
        <Tooltip label={isDefault ? 'Default agent' : 'Set as default agent'}>
            <ActionIcon
                className={styles.button}
                radius="md"
                variant="subtle"
                color="gray"
                onClick={() => {
                    void setDefaultAgentUuid({
                        defaultAgentUuid: agentUuid,
                    });
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
