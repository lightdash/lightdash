import { useForm } from '@mantine/form';
import { screen } from '@testing-library/react';
import { type ComponentProps, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type LoginParams } from '../hooks/useLogin';
import { LoginForm } from './LoginLanding';

type LoginFormHarnessProps = Pick<
    ComponentProps<typeof LoginForm>,
    'formStage' | 'formStatus' | 'layout'
>;

const LoginFormHarness: FC<LoginFormHarnessProps> = (props) => {
    const form = useForm<LoginParams>({
        initialValues: { email: '', password: '' },
    });

    return (
        <LoginForm
            alternativeLoginIntent={undefined}
            availability={{ email: true, emailOtp: false }}
            form={form}
            {...props}
            lastUsedSsoProvider={undefined}
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
        renderWithProviders(
            <LoginFormHarness
                formStage="precheck"
                formStatus="idle"
                layout="new"
            />,
        );

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

describe('LoginForm password focus', () => {
    it.each(['new', 'legacy'] as const)(
        'focuses the password after a slow email precheck in the %s layout',
        (layout) => {
            const renderForm = (
                formStage: LoginFormHarnessProps['formStage'],
                formStatus: LoginFormHarnessProps['formStatus'],
            ) => (
                <MemoryRouter>
                    <LoginFormHarness
                        layout={layout}
                        formStage={formStage}
                        formStatus={formStatus}
                    />
                </MemoryRouter>
            );
            const { rerender } = renderWithProviders(
                renderForm('precheck', 'loading'),
            );

            expect(
                screen.queryByLabelText(/^Password/),
            ).not.toBeInTheDocument();
            rerender(renderForm('login', 'loading'));
            const password = screen.getByLabelText(/^Password/);
            expect(password).toBeDisabled();
            expect(password).not.toHaveFocus();

            rerender(renderForm('login', 'idle'));
            expect(password).toBeEnabled();
            expect(password).toHaveFocus();

            const email = screen.getByRole('textbox');
            email.focus();
            rerender(renderForm('login', 'idle'));
            expect(email).toHaveFocus();
        },
    );
});
