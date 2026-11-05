import type { Meta, StoryObj } from '@storybook/react-vite';
import Register from '../../pages/Register';
import VerifyEmail from '../../pages/VerifyEmail';
import {
    minutesFromNow,
    OnboardingStory,
    storyHealth,
    storyUser,
} from './storyApi';

const meta: Meta = {
    title: 'Onboarding/01 Sign up',
    parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj;

export const Register_: Story = {
    name: 'Register (email only)',
    render: () => (
        <OnboardingStory
            path="/register"
            url="/register"
            element={<Register />}
            routes={{
                'GET /health': storyHealth({ isAuthenticated: false }),
            }}
        />
    ),
};

export const VerifyEmailCode: Story = {
    name: 'Verify email (OTP)',
    render: () => (
        <OnboardingStory
            path="/verify-email"
            url="/verify-email"
            element={<VerifyEmail />}
            routes={{
                'GET /user': storyUser({ isSetupComplete: false }),
                'GET /user/me/email/status': {
                    email: 'maya@example.com',
                    isVerified: false,
                    otp: {
                        createdAt: minutesFromNow(-1),
                        expiresAt: minutesFromNow(14),
                        numberOfAttempts: 0,
                        isExpired: false,
                        isMaxAttempts: false,
                    },
                },
            }}
        />
    ),
};
