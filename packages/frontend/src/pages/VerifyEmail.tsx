import {
    Anchor,
    Box,
    Button,
    Card,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconCircleCheckFilled,
    IconConfetti,
    IconMail,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import { SuccessIconBounce } from '../components/RegisterForms/ProjectConnectFlow.styles';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import MantineModal from '../components/common/MantineModal';
import Page from '../components/common/Page/Page';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useApp from '../providers/App/useApp';

const VerificationSuccess: FC<{
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    const theme = useMantineTheme();
    return (
        <MantineModal
            size="sm"
            opened={isOpen}
            onClose={onClose}
            title="You are all set!"
            icon={IconConfetti}
            cancelLabel={false}
            actions={<Button onClick={onContinue}>Continue</Button>}
        >
            <Stack align="center">
                <SuccessIconBounce
                    icon={IconCircleCheckFilled}
                    size={42}
                    style={{
                        color: theme.colors.green[6],
                    }}
                />
                <Stack gap="two">
                    <Text ta="center" fz="md" fw={500}>
                        Your email has been verified successfully.
                    </Text>
                    <Text ta="center" fz="sm" c="ldGray.6">
                        You can now start exploring your data.
                    </Text>
                </Stack>
            </Stack>
        </MantineModal>
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
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <VerifyEmailForm
                        emailStatusData={data}
                        statusLoading={statusLoading}
                    />
                </Card>
                <Text c="ldGray.6" ta="center" px="xs">
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Verify your email"
            cancelLabel={false}
            icon={IconMail}
        >
            <VerifyEmailForm isLoading={isLoading} />
        </MantineModal>
    );
};

export default VerifyEmailPage;
