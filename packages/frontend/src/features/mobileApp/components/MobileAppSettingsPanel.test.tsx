import { MobileSetupCodeStatus } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileAppSettingsPanel from './MobileAppSettingsPanel';

const session = vi.hoisted(() => ({
    status: 'pending',
    link: 'https://app.example.com/mobile-setup?v=2',
    verificationCode: null as string | null,
    isLoading: false,
    error: null,
    setupAnotherDevice: vi.fn(),
}));

vi.mock('../hooks/useMobileSetupSession', () => ({
    useMobileSetupSession: () => session,
}));
vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));
vi.mock('../../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        activeProjectUuid: 'project',
        isLoading: false,
    }),
}));
vi.mock('../../../components/common/Settings/SettingsPage', () => ({
    SettingsPage: ({ children }: { children: React.ReactNode }) => children,
}));

const renderPanel = () =>
    render(
        <MantineProvider env="test">
            <MobileAppSettingsPanel />
        </MantineProvider>,
    );

beforeEach(() => {
    session.status = MobileSetupCodeStatus.PENDING;
    session.verificationCode = null;
    vi.clearAllMocks();
});

describe('MobileAppSettingsPanel verification', () => {
    it('shows the QR before a phone scans and does not show verification digits', () => {
        renderPanel();
        expect(
            screen.getByText('Lightdash mobile app setup code'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Enter this code on your phone'),
        ).not.toBeInTheDocument();
    });

    it('replaces the QR with six readable digits and preserves leading zeros', () => {
        session.status = MobileSetupCodeStatus.AWAITING_VERIFICATION;
        session.verificationCode = '001234';
        renderPanel();
        expect(
            screen.getByLabelText('Verification code: 0 0 1 2 3 4'),
        ).toHaveTextContent('001 234');
        expect(
            screen.queryByText('Lightdash mobile app setup code'),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Never share it/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Start again/ }));
        expect(session.setupAnotherDevice).toHaveBeenCalledOnce();
    });

    it('does not claim sign-in is complete when the grant has been redeemed', () => {
        session.status = MobileSetupCodeStatus.REDEEMED;
        session.verificationCode = '001234';
        renderPanel();
        expect(screen.getByText('Code verified')).toBeInTheDocument();
        expect(
            screen.getByText('Finish signing in on your phone.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Signed in on your phone'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText(/Verification code:/),
        ).not.toBeInTheDocument();
    });
});
