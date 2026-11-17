import { LOGIN_PAGE_ID } from '@lightdash/common';
import { Box, Card, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import AuthLayout from '../components/common/AuthLayout';
import AuthBrandLogo from '../components/common/AuthLayout/AuthBrandLogo';
import AuthTermsFooter from '../components/common/AuthLayout/AuthTermsFooter';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import LoginLanding from '../features/users/components/LoginLanding';

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    const { isNewLayout } = useAuthLayoutVariant();
    if (minimal) {
        return (
            <Stack m="xl">
                <Box mx="auto" my="lg">
                    <AuthBrandLogo fallback={<LightdashLogo />} />
                </Box>
                <Card id={LOGIN_PAGE_ID} p="xl" radius="md">
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
            legacyTitle="Sign in"
            cardId={LOGIN_PAGE_ID}
            withCustomerLogos
            footer={
                <AuthTermsFooter
                    isNewLayout={isNewLayout}
                    legacyLead="By signing in, you agree to"
                />
            }
        >
            <LoginLanding />
        </AuthLayout>
    );
};

export default Login;
