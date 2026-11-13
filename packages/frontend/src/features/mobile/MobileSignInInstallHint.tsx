import { LightdashMode } from '@lightdash/common';
import { Text } from '@mantine/core';
import { type FC } from 'react';
import useHealth from '../../hooks/health/useHealth';
import { MOBILE_SIGN_IN_STRINGS } from './mobileStrings';

export const MobileSignInInstallHint: FC = () => {
    const { data: health } = useHealth();

    return health?.mode === LightdashMode.CLOUD_BETA ? (
        <Text size="sm" c="dimmed">
            {MOBILE_SIGN_IN_STRINGS.installHint}
        </Text>
    ) : null;
};
