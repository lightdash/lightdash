import { useForm } from '@mantine/form';
import { screen } from '@testing-library/react';
import { type FC } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type LoginParams } from '../hooks/useLogin';
import { LoginForm } from './LoginLanding';

const LoginFormHarness: FC = () => {
    const form = useForm<LoginParams>({
        initialValues: { email: '', password: '' },
    });

    return (
        <LoginForm
            alternativeLoginIntent={undefined}
            availability={{ email: true, emailOtp: false }}
            form={form}
            formStatus="idle"
            formStage="precheck"
            lastUsedSsoProvider={undefined}
            layout="new"
            loginHint={undefined}
            mobileLoginIntent="local"
            onClearEmail={() => {}}
            onEmailOtpSuccess={() => {}}
            onSubmit={() => {}}
            preCheckEmail={undefined}
            redirectUrl="/"
            signupPath={null}
            signupUrl="/register"
            ssoOptions={[]}
        />
    );
};

describe('LoginForm work email input', () => {
    it('does not let iOS auto-capitalise, autocorrect, or spellcheck the address', () => {
        renderWithProviders(<LoginFormHarness />);

        const emailInput = screen.getByRole('textbox', {
            name: /work email/i,
        });

        expect(emailInput).toHaveAttribute('type', 'email');
        expect(emailInput).toHaveAttribute('inputmode', 'email');
        expect(emailInput).toHaveAttribute('autocapitalize', 'none');
        expect(emailInput).toHaveAttribute('autocorrect', 'off');
        expect(emailInput).toHaveAttribute('spellcheck', 'false');
    });
});
