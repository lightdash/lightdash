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
import { Trans, useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useIntercom } from 'react-use-intercom';
import AuthLayout from '../components/common/AuthLayout';
import { useAuthLayoutVariant } from '../components/common/AuthLayout/useAuthLayoutVariant';
import MantineIcon from '../components/common/MantineIcon';
import MantineModal from '../components/common/MantineModal';
import PageSpinner from '../components/PageSpinner';
import VerifyEmailForm from '../components/RegisterForms/VerifyEmailForm';
import { useEmailStatus } from '../hooks/useEmailVerification';
import useLogoutMutation from '../hooks/user/useUserLogoutMutation';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import { sanitizeRedirectUrl } from '../utils/redirectUrl';
import classes from './VerifyEmail.module.css';

const VerificationSuccess: FC<{
    isOpen: boolean;
    onClose: () => void;
    onContinue: () => void;
}> = ({ isOpen, onClose, onContinue }) => {
    const { t } = useTranslation('auth');
    const theme = useMantineTheme();
    return (
        <MantineModal
            size="sm"
            opened={isOpen}
            onClose={onClose}
            title={t('verifyEmailPage.allSet')}
            icon={IconConfetti}
            cancelLabel={false}
            actions={
                <Button onClick={onContinue}>{t('login.continue')}</Button>
            }
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
                        {t('verifyEmailPage.verified')}
                    </Text>
                    <Text ta="center" fz="sm" c="dimmed">
                        {t('verifyEmailPage.startExploring')}
                    </Text>
                </Stack>
            </Stack>
        </MantineModal>
    );
};

const VerifyEmailPage: FC = () => {
    const { t } = useTranslation('auth');
    const { health } = useApp();
    const { data, isInitialLoading: statusLoading } = useEmailStatus(
        !!health.data?.isAuthenticated,
    );
    const { show: showIntercom } = useIntercom();
    const { isNewLayout } = useAuthLayoutVariant();
    const { mutate: logout, isLoading: isLoggingOut } = useLogoutMutation({
        onSuccess: () => {
            window.location.href = '/register';
        },
    });
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

    if (!health.data?.isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (isVerifiedEmailOnlySignup) {
        return redirectTo === null ? <Navigate to="/" /> : <PageSpinner />;
    }

    return (
        <AuthLayout
            pageTitle={t('verifyEmailPage.pageTitle')}
            title={t('verifyEmailPage.title')}
            subtitle={
                <>
                    {t('verifyEmailPage.sentCode', {
                        email: data?.email ?? t('verifyEmail.yourEmail'),
                    })}{' '}
                    <Anchor
                        component="button"
                        type="button"
                        inherit
                        disabled={isLoggingOut}
                        onClick={() => logout()}
                    >
                        {t('verifyEmailPage.wrongEmail')}
                    </Anchor>
                </>
            }
            withLegacyCard={false}
            withCustomerLogos
            footer={
                isNewLayout ? (
                    <Text c="dimmed" ta="center" fz="xs">
                        {t('verifyEmailPage.needHand')}{' '}
                        <Anchor
                            component="button"
                            type="button"
                            inherit
                            onClick={() => showIntercom()}
                        >
                            {t('verifyEmailPage.chatToSupport')}
                        </Anchor>
                    </Text>
                ) : (
                    <Text c="dimmed" ta="center" px="xs" fz="sm" fw={500}>
                        <Trans
                            t={t}
                            i18nKey="verifyEmailPage.legacyFooter"
                            components={{
                                link: (
                                    <Anchor
                                        onClick={() => showIntercom()}
                                        fz="sm"
                                        fw={500}
                                    />
                                ),
                            }}
                        />
                    </Text>
                )
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
    const { t } = useTranslation('auth');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('verifyEmailPage.pageTitle')}
            cancelLabel={false}
            icon={IconMail}
        >
            <VerifyEmailForm isLoading={isLoading} />
        </MantineModal>
    );
};

export default VerifyEmailPage;
