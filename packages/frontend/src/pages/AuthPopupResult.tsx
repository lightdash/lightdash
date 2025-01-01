import { Image, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { useMount } from 'react-use';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../svgs/lightdash-black.svg';

const AuthPopupResult: FC = () => {
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
            <Helmet>
                <title>Authentication - Lightdash</title>
            </Helmet>
            <Stack>
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
                {status === 'success' ? (
                    <SuboptimalState
                        title={'Thank you for authenticating'}
                        description={'This window will close automatically'}
                    />
                ) : (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={'Authentication failed. Please try again'}
                        description={'This window will close automatically'}
                    />
                )}
            </Stack>
        </>
    );
};

export default AuthPopupResult;
