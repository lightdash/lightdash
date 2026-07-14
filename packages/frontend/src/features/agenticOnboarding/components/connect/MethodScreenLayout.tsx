import { Divider, Stack, Title } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import DemoHatch from '../DemoHatch';
import OtherWaysToConnectLink from './OtherWaysToConnectLink';
import TrustNote from './TrustNote';

type MethodScreenLayoutProps = {
    title: string;
    children: ReactNode;
    hideTrustNote?: boolean;
};

const MethodScreenLayout: FC<MethodScreenLayoutProps> = ({
    title,
    children,
    hideTrustNote = false,
}) => (
    <Stack gap="md">
        <OtherWaysToConnectLink />
        <Title order={3} tabIndex={-1} data-onboarding-heading>
            {title}
        </Title>
        {children}
        <Divider />
        {!hideTrustNote && <TrustNote />}
        <DemoHatch />
    </Stack>
);

export default MethodScreenLayout;
