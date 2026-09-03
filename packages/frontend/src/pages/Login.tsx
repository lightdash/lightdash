import { LOGIN_PAGE_ID } from '@lightdash/common';
import { Box, Card, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import AuthLayout from '../components/common/AuthLayout';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import LoginLanding from '../features/users/components/LoginLanding';

const LOGIN_BACKGROUND_COLOR = 'pink.1';

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    if (minimal) {
        return (
            <Stack bg={LOGIN_BACKGROUND_COLOR} mih="100vh" p="xl">
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                <Card
                    id={LOGIN_PAGE_ID}
                    p="xl"
                    radius="xs"
                    withBorder
                    shadow="xs"
                >
                    <Title order={3} ta="center" mb="md">
                        Sign in
                    </Title>
                    <LoginLanding />
                </Card>
            </Stack>
        );
    }

    return (
        <AuthLayout
            pageTitle="Login"
            title="Log in"
            subtitle="Welcome back — pick up where you left off."
            legacyTitle="Sign in"
            cardId={LOGIN_PAGE_ID}
            formBackgroundColor={LOGIN_BACKGROUND_COLOR}
        >
            <LoginLanding />
        </AuthLayout>
    );
};

export default Login;
