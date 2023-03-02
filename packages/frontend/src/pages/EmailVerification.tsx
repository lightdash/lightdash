import React, { FC, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import Page from '../components/common/Page/Page';
import { VerifyEmailForm } from '../components/CreateUserForm/VerifyEmailForm';
import PageSpinner from '../components/PageSpinner';
import { useApp } from '../providers/AppProvider';

// this is a mockup and is meant to be replaced by the actual hook that communicates with the BE
const useVerifyMutation = () => {
    const [error, setError] = useState<{ attempts: number }>();
    return {
        mutate: () => {
            setError({ attempts: 4 });
        },
        error,
    };
};

const EmailVerification: FC = () => {
    const { health } = useApp();
    const methods = useForm<{ code: string }>({ mode: 'onSubmit' });
    const { mutate, error } = useVerifyMutation();
    const { setError, clearErrors } = methods;
    useEffect(() => {
        if (error) {
            const remainingAttempts = 5 - error.attempts;
            const message =
                error.attempts < 5
                    ? `The code doesn't match the one we sent you. You have ${remainingAttempts} attempt${
                          remainingAttempts > 1 ? 's' : ''
                      } left.`
                    : "Hmm that code doesn't match the one we sent you. You've already had 5 attempts, please resend a verification email and try again.";
            setError('code', { type: 'custom', message });
        } else {
            clearErrors('code');
        }
    }, [error, clearErrors, setError]);

    if (health.isLoading) {
        return <PageSpinner />;
    }

    return (
        <Page isFullHeight>
            <Helmet>
                <title>Verify your email - Lightdash</title>
            </Helmet>
            <VerifyEmailForm
                email="localhost@mail.com"
                methods={methods}
                expirationTime="2023-03-02T16:30:00"
                onSubmit={() => {
                    mutate();
                }}
                onResend={() => {}}
            />
        </Page>
    );
};

export default EmailVerification;
