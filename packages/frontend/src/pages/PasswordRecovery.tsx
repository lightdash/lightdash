import { Box, Card, Stack } from '@mantine/core';
import { type FC } from 'react';
import { Navigate } from 'react-router';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import Page from '../components/common/Page/Page';
import useApp from '../providers/App/useApp';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

const PasswordRecovery: FC = () => {
    const { health } = useApp();

    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: '/' }} />;
    }

    return (
        <Page title="Recover password" withCenteredContent withNavbar={false}>
            {/* FIXME: use Mantine sizes for width */}
            <Stack w={400} mt="4xl">
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <PasswordRecoveryForm />
                </Card>
            </Stack>
        </Page>
    );
};

export default PasswordRecovery;
