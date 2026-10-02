import { type PersonSignInProvider } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import { useIsSharedSignInOwnershipEnabled } from '../../../hooks/useWarehouseCredentialSummary';
import { useProjectFormContext } from '../useProjectFormContext';
import { getSetupLine } from './sharedSignInCopy';

export const SharedSignInSetupLine: FC<{ provider: PersonSignInProvider }> = ({
    provider,
}) => {
    const isEnabled = useIsSharedSignInOwnershipEnabled();
    const { savedProject, isProjectExtraConnection } = useProjectFormContext();
    if (!isEnabled || savedProject || isProjectExtraConnection) return null;
    return (
        <Text size="xs" c="dimmed">
            {getSetupLine(provider)}
        </Text>
    );
};
