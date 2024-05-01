import { Card, Image, Stack } from '@mantine/core';
import { type FC } from 'react';
import { Redirect } from 'react-router-dom';

import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';

const PasswordRecovery: FC = () => {
    const { health } = useApp();

    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    return (
        <Page title="Recover password" withCenteredContent withNavbar={false}>
            {/* FIXME: use Mantine sizes for width */}
            <Stack w={400} mt="4xl">
                <Image
                    src={
                        health.data?.siteLogoBlack
                            ? health.data?.siteLogoBlack
                            : LightdashLogo
                    }
                    alt={`${health.data?.siteName} logo`}
                    width={130}
                    mx="auto"
                    my="lg"
                />
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <PasswordRecoveryForm />
                </Card>
            </Stack>
        </Page>
    );
};

export default PasswordRecovery;
