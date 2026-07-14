import { SnowflakeAuthenticationType } from '@lightdash/common';
import { type FC } from 'react';
import MethodScreenLayout from './MethodScreenLayout';
import SnowflakeMethodScreen from './SnowflakeMethodScreen';

const ConnectMethodManual: FC = () => (
    <MethodScreenLayout title="Enter details manually">
        <SnowflakeMethodScreen
            authenticationType={SnowflakeAuthenticationType.PRIVATE_KEY}
            showLeastPrivilege
        />
    </MethodScreenLayout>
);

export default ConnectMethodManual;
