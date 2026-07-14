import { SnowflakeAuthenticationType } from '@lightdash/common';
import { type FC } from 'react';
import MethodScreenLayout from './MethodScreenLayout';
import SnowflakeMethodScreen from './SnowflakeMethodScreen';

const ConnectMethodPassword: FC = () => (
    <MethodScreenLayout title="Username & password">
        <SnowflakeMethodScreen
            authenticationType={SnowflakeAuthenticationType.PASSWORD}
            showLeastPrivilege
        />
    </MethodScreenLayout>
);

export default ConnectMethodPassword;
