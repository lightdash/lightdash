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
    useMantineTheme,
} from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import PageSpinner from '../components/PageSpinner';
import { SuccessIconBounce } from '../components/RegisterForms/ProjectConnectFlow.styles';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import Page from '../components/common/Page/Page';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useApp from '../providers/App/useApp';
import LightdashLogo from '../svgs/lightdash-black.svg';

const VerificationSuccess: FC<{
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    const theme = useMantineTheme();
    return (
        <Modal
            size="sm"
            opened={isOpen}
            onClose={onClose}
            withCloseButton={false}
        >
            <Stack align="center" my="md">
                <Title order={3}>Great, you're verified! 🎉</Title>

                <SuccessIconBounce
                    icon={IconCircleCheckFilled}
                    size={64}
                    style={{
                        color: theme.colors.green[6],
                    }}
                />
                <Button onClick={onContinue}>Continue</Button>
            </Stack>
        </Modal>
    );
};

const VerifyEmailPage: FC = () => {
    const { health } = useApp();
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const { show: showIntercom } = useIntercom();
    const navigate = useNavigate();

    if (health.isInitialLoading || statusLoading) {
        return <PageSpinner />;
    }

    return (
        <Page title="Verify your email" withCenteredContent withNavbar={false}>
            <Stack w={400} mt="4xl">
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
                            void navigate('/');
                        }}
                        onContinue={() => {
                            void navigate('/');
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

export default VerifyEmailPage;
