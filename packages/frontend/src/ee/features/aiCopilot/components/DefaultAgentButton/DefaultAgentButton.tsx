import { type ActionIconProps, type MantineSize } from '@mantine/core';
import clsx from 'clsx';
import { useState } from 'react';
import { FavoriteActionIcon } from '../../../../../components/common/FavoriteActionIcon';
import {
    useDeleteUserAgentPreferences,
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
    className,
    disabled,
    ...props
}) => {
    const [hasInteracted, setHasInteracted] = useState(false);
    const { data: userAgentPreferences, isLoading: isLoadingPreferences } =
        useGetUserAgentPreferences(projectUuid);
    const { mutate: setDefaultAgentUuid, isLoading: isSettingDefault } =
        useUpdateUserAgentPreferences(projectUuid ?? '');
    const { mutate: deleteUserPreferences, isLoading: isRemovingDefault } =
        useDeleteUserAgentPreferences(projectUuid ?? '');

    const isDefault = userAgentPreferences?.defaultAgentUuid === agentUuid;

    return (
        <FavoriteActionIcon
            {...props}
            isFavorite={isDefault}
            label={
                isDefault ? 'Remove as default agent' : 'Set as default agent'
            }
            aria-pressed={isDefault}
            aria-busy={isSettingDefault || isRemovingDefault}
            data-starred={isDefault}
            data-interacted={hasInteracted || undefined}
            className={clsx(styles.button, className)}
            onToggle={() => {
                setHasInteracted(true);
                if (isDefault) {
                    deleteUserPreferences();
                } else {
                    setDefaultAgentUuid({ defaultAgentUuid: agentUuid });
                }
            }}
            disabled={
                disabled ||
                !projectUuid ||
                isLoadingPreferences ||
                isSettingDefault ||
                isRemovingDefault
            }
            variant={isDefault ? 'light' : 'subtle'}
            size={size}
            iconSize="md"
            favoriteColor="yellow"
        />
    );
};
