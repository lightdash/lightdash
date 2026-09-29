import { FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    Button,
    Card,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconCircleCheckFilled,
    IconConfetti,
    IconMail,
} from '@tabler/icons-react';
import { useCallback, useEffect, type FC } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import AuthLayout from '../components/common/AuthLayout';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import PageSpinner from '../components/PageSpinner';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import { useEmailStatus } from '../hooks/useEmailVerification';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import { sanitizeRedirectUrl } from '../utils/redirectUrl';
import classes from './VerifyEmail.module.css';

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
                <MantineIcon
                    className={classes.successIcon}
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
                    <Text ta="center" fz="sm" c="dimmed">
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
    const { isNewLayout } = useAuthLayoutVariant();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const redirectParam = searchParams.get('redirect');
    const redirectTo =
        redirectParam === null ? null : sanitizeRedirectUrl(redirectParam);
    const emailOnlySignupFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
    );
    const isEmailOnlySignup = emailOnlySignupFlag.data?.enabled ?? false;
    const isVerifiedEmailOnlySignup = isEmailOnlySignup && !!data?.isVerified;

    const continueAfterVerification = useCallback(() => {
        if (redirectTo === null) {
            void navigate('/');
            return;
        }
        window.location.href = redirectTo;
    }, [navigate, redirectTo]);

    useEffect(() => {
        if (isVerifiedEmailOnlySignup && redirectTo !== null) {
            window.location.href = redirectTo;
        }
    }, [isVerifiedEmailOnlySignup, redirectTo]);

    if (
        health.isInitialLoading ||
        statusLoading ||
        emailOnlySignupFlag.isInitialLoading
    ) {
        return <PageSpinner />;
    }

    if (isVerifiedEmailOnlySignup) {
        return redirectTo === null ? <Navigate to="/" /> : <PageSpinner />;
    }

    return (
        <AuthLayout
            pageTitle="Verify your email"
            withLegacyCard={false}
            footer={
                <Text c="dimmed" ta="center" px="xs" fz="sm" fw={500}>
                    You need to verify your email to get access to Lightdash. If
                    you need help, you can{' '}
                    <Anchor onClick={() => showIntercom()} fz="sm" fw={500}>
                        chat to support here.
                    </Anchor>
                </Text>
            }
        >
            {isNewLayout ? (
                <VerifyEmailForm
                    emailStatusData={data}
                    statusLoading={statusLoading}
                    align="left"
                />
            ) : (
                <Card p="xl">
                    <VerifyEmailForm
                        emailStatusData={data}
                        statusLoading={statusLoading}
                    />
                </Card>
            )}
            {!isEmailOnlySignup && data && (
                <VerificationSuccess
                    isOpen={data.isVerified}
                    onClose={continueAfterVerification}
                    onContinue={continueAfterVerification}
                />
            )}
        </AuthLayout>
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
