import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useIsSharedSignInOwnershipEnabled } from '../../../hooks/useSharedCredentialOwner';
import { useProjectFormContext } from '../useProjectFormContext';
import { SHARED_SIGN_IN_SETUP_LINE } from './sharedSignInCopy';

export const SharedSignInSetupLine: FC = () => {
    const isEnabled = useIsSharedSignInOwnershipEnabled();
    const { savedProject, isProjectExtraConnection } = useProjectFormContext();
    if (!isEnabled || savedProject || isProjectExtraConnection) return null;
    return (
        <Text size="xs" c="dimmed">
            {SHARED_SIGN_IN_SETUP_LINE}
        </Text>
    );
};
