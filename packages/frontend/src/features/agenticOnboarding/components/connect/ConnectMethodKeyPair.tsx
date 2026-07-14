import { SnowflakeAuthenticationType } from '@lightdash/common';
import { type FC } from 'react';
import MethodScreenLayout from './MethodScreenLayout';
import SnowflakeMethodScreen from './SnowflakeMethodScreen';

const ConnectMethodKeyPair: FC = () => (
    <MethodScreenLayout title="Key-pair authentication">
        <SnowflakeMethodScreen
            authenticationType={SnowflakeAuthenticationType.PRIVATE_KEY}
            showLeastPrivilege
        />
    </MethodScreenLayout>
);

export default ConnectMethodKeyPair;
