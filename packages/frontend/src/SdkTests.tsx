import { Text } from '@mantine/core';
import { version, type FC } from 'react';

export const TestFrontendForSdk: FC = () => {
    return <Text>Hello from @lightdash/frontend - React {version}</Text>;
};
