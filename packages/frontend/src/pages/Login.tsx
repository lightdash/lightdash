import { Stack } from '@mantine/core';
import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import LoginLanding from '../features/users/components/LoginLanding';

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    return minimal ? (
        <Stack m="xl">
            <LoginLanding />
        </Stack>
    ) : (
        <Page title="Login" withCenteredContent>
            <Stack w={400} mt="4xl">
                <LoginLanding />
            </Stack>
        </Page>
    );
};

export default Login;
