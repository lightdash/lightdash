import { Anchor, Text } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import AuthLayout from '../components/common/AuthLayout';
import MantineModal from '../components/common/MantineModal';
import { useTrackOnboardingScreen } from '../components/common/useTrackOnboardingScreen';
import PageSpinner from '../components/PageSpinner';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useLogoutMutation from '../hooks/user/useUserLogoutMutation';
import useApp from '../providers/App/useApp';
import { sanitizeRedirectUrl } from '../utils/redirectUrl';

const VerifyEmailPage: FC = () => {
    const { health } = useApp();
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const { show: showIntercom } = useIntercom();
    const { mutate: logout, isLoading: isLoggingOut } = useLogoutMutation({
        onSuccess: () => {
            window.location.href = '/register';
        },
    });
    const [searchParams] = useSearchParams();
    const redirectParam = searchParams.get('redirect');
    const redirectTo =
        redirectParam === null ? null : sanitizeRedirectUrl(redirectParam);
    const isVerified = !!data?.isVerified;
    useTrackOnboardingScreen(
        !!health.data?.isAuthenticated && data?.isVerified === false
            ? 'verify_email'
            : null,
    );

    useEffect(() => {
        if (isVerified && redirectTo !== null) {
            window.location.href = redirectTo;
        }
    }, [isVerified, redirectTo]);

    if (health.isInitialLoading || statusLoading) {
        return <PageSpinner />;
    }

    if (!health.data?.isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (isVerified) {
        return redirectTo === null ? <Navigate to="/" /> : <PageSpinner />;
    }

    return (
        <AuthLayout
            pageTitle="Verify your email"
            title="Check your inbox"
            subtitle={
                <>
                    We sent a 6-digit code to {data?.email ?? 'your email'}.{' '}
                    <Anchor
                        component="button"
                        type="button"
                        inherit
                        disabled={isLoggingOut}
                        onClick={() => logout()}
                    >
                        Wrong email?
                    </Anchor>
                </>
            }
            withCustomerLogos
            footer={
                <Text c="dimmed" ta="center" fz="xs">
                    Need a hand?{' '}
                    <Anchor
                        component="button"
                        type="button"
                        inherit
                        onClick={() => showIntercom()}
                    >
                        Chat to support
                    </Anchor>
                </Text>
            }
        >
            <VerifyEmailForm
                emailStatusData={data}
                statusLoading={statusLoading}
                align="left"
            />
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
