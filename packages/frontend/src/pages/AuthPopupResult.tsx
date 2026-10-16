import { Box, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useMount } from 'react-use';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';

const AuthPopupResult: FC = () => {
    const { t } = useTranslation('pages');
    const { status } = useParams<{ status: string }>();

    useMount(() => {
        // send message to parent window
        const channel = new BroadcastChannel('lightdash-oauth-popup');
        channel.postMessage(status);
        // automatically close the window after 2 seconds
        setTimeout(() => {
            window.close();
        }, 2000);
    });

    return (
        <>
            <DocumentTitle title={t('authPopup.documentTitle')} />

            <Stack>
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                {status === 'success' ? (
                    <SuboptimalState
                        title={t('authPopup.success')}
                        description={t('authPopup.willClose')}
                    />
                ) : (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={t('authPopup.failed')}
                        description={t('authPopup.willClose')}
                    />
                )}
            </Stack>
        </>
    );
};

export default AuthPopupResult;
