import { LOGIN_PAGE_ID } from '@lightdash/common';
import { Box, Card, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/common/AuthLayout';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import LoginLanding from '../features/users/components/LoginLanding';

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    const { t } = useTranslation('auth');
    if (minimal) {
        return (
            <Stack m="xl">
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                <Card id={LOGIN_PAGE_ID} p="xl" radius="md">
                    <Title order={3} ta="center" mb="md">
                        {t('login.legacyTitle')}
                    </Title>
                    <LoginLanding />
                </Card>
            </Stack>
        );
    }

    return (
        <AuthLayout
            pageTitle={t('login.pageTitle')}
            title={t('login.title')}
            subtitle={t('login.subtitle')}
            legacyTitle={t('login.legacyTitle')}
            cardId={LOGIN_PAGE_ID}
            withCustomerLogos
        >
            <LoginLanding />
        </AuthLayout>
    );
};

export default Login;
