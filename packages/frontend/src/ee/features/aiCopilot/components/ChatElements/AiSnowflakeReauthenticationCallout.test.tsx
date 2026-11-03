import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiSnowflakeReauthenticationCallout } from './AiSnowflakeReauthenticationCallout';

vi.mock('../../../../../hooks/health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: 'https://app.example',
            auth: { snowflake: { enabled: true } },
        },
    }),
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));

let onMessage: (event: MessageEvent) => void;
const closePopup = vi.fn();

beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({
        close: closePopup,
    } as unknown as Window);
    vi.stubGlobal(
        'BroadcastChannel',
        class {
            addEventListener(
                _event: string,
                listener: (event: MessageEvent) => void,
            ) {
                onMessage = listener;
            }
            removeEventListener = vi.fn();
            close = vi.fn();
        },
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const reconnect = async () => {
    renderWithProviders(<AiSnowflakeReauthenticationCallout />);
    fireEvent.click(
        screen.getByRole('button', { name: 'Re-authenticate with Snowflake' }),
    );
    await waitFor(() => expect(window.open).toHaveBeenCalledOnce());
};

it('uses personal Snowflake sign-in and explains how to continue after success', async () => {
    await reconnect();
    expect(window.open).toHaveBeenCalledWith(
        'https://app.example/api/v1/login/snowflake?isPopup=true',
        'login-popup',
        'width=600,height=600',
    );
    act(() =>
        onMessage(
            new MessageEvent('message', {
                origin: 'https://app.example',
                data: 'success',
            }),
        ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
        'Send your question again to continue',
    );
    expect(
        screen.queryByRole('button', {
            name: 'Re-authenticate with Snowflake',
        }),
    ).not.toBeInTheDocument();
});

it('keeps reconnect available after authentication fails', async () => {
    await reconnect();
    act(() =>
        onMessage(
            new MessageEvent('message', {
                origin: 'https://app.example',
                data: 'error',
            }),
        ),
    );
    expect(await screen.findByText('Authentication failed')).toBeVisible();
    expect(
        screen.getByRole('button', { name: 'Re-authenticate with Snowflake' }),
    ).toBeEnabled();
});

it('keeps reconnect available when the browser blocks the popup', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    await reconnect();
    expect(
        await screen.findByText('Failed to open popup window'),
    ).toBeVisible();
    expect(
        screen.getByRole('button', { name: 'Re-authenticate with Snowflake' }),
    ).toBeEnabled();
});
