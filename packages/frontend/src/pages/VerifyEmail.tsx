import { Colors } from '@blueprintjs/core';
import {
    Anchor,
    Box,
    Button,
    Card,
    Image,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import React, { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useHistory } from 'react-router-dom';
import { useIntercom } from 'react-use-intercom';
import Page from '../components/common/Page/Page';
import VerifyEmailForm from '../components/CreateUserForm/VerifyEmailForm';
import PageSpinner from '../components/PageSpinner';
import { StyledSuccessIcon } from '../components/ProjectConnection/ProjectConnectFlow/ProjectConnectFlow.styles';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useApp } from '../providers/AppProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

export const VerificationSuccess: FC<{
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    return (
        <Modal opened={isOpen} onClose={onClose} withCloseButton={false}>
            <Stack align="center" my="md">
                <Title order={3}>Great, you're verified! 🎉</Title>
                <StyledSuccessIcon
                    icon="tick-circle"
                    color={Colors.GREEN4}
                    size={64}
                />
                <Button onClick={onContinue}>Continue</Button>
            </Stack>
        </Modal>
    );
};

export const VerifyEmailPage: FC = () => {
    const { health } = useApp();
    const { data, isLoading: statusLoading } = useEmailStatus();
    const { show: showIntercom } = useIntercom();
    const history = useHistory();

    if (health.isLoading || statusLoading) {
        return <PageSpinner />;
    }

    return (
        <Page isFullHeight>
            <Helmet>
                <title>Verify your email - Lightdash</title>
            </Helmet>
            {/* FIXME: use Mantine sizes for width */}
            <Stack w={400} mt="xl" pt="lg">
                <Image
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <VerifyEmailForm />
                </Card>
                <Text color="gray.6" ta="center" px="xs">
                    You need to verify your email to get access to Lightdash. If
                    you need help, you can{' '}
                    <Anchor onClick={() => showIntercom()}>
                        chat to support here.
                    </Anchor>
                </Text>
                {data && (
                    <VerificationSuccess
                        isOpen={data.isVerified}
                        onClose={() => {
                            history.push('/');
                        }}
                        onContinue={() => {
                            history.push('/');
                        }}
                    />
                )}
            </Stack>
        </Page>
    );
};

export const VerifyEmailModal: FC<{
    opened: boolean;
    onClose: () => void;
    isLoading: boolean;
}> = ({ opened, onClose, isLoading }) => {
    return (
        <Modal opened={opened} onClose={onClose}>
            <Box my="md">
                <VerifyEmailForm isLoading={isLoading} />
            </Box>
        </Modal>
    );
};
