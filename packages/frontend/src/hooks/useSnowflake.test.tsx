import { AgentIdentityConnectEntryPoint } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import {
    useSnowflakeAiLoginPopup,
    useSnowflakeLoginPopup,
} from './useSnowflake';

const mocks = vi.hoisted(() => ({ siteUrl: 'https://app.example' }));
vi.mock('./health/useHealth', () => ({
    default: () => ({
        data: {
            siteUrl: mocks.siteUrl,
            auth: { snowflake: { enabled: true } },
        },
    }),
}));
vi.mock('./toaster/useToaster', () => ({
    default: () => ({ showToastError: vi.fn() }),
}));
vi.mock('../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));

let onMessage: (event: MessageEvent) => void;
const closePopup = vi.fn();
const closeChannel = vi.fn();
const createWrapper = () => {
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

beforeEach(() => {
    mocks.siteUrl = 'https://app.example';
    vi.clearAllMocks();
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
            close = closeChannel;
        },
    );
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([
    {
        entryPoint: AgentIdentityConnectEntryPoint.CHAT_CARD,
        projectUuid: 'b0ca6ddd-0ea1-419b-aed7-9a6dca81ca4c',
    },
    {
        entryPoint: AgentIdentityConnectEntryPoint.MY_WAREHOUSE_CONNECTIONS,
        projectUuid: null,
    },
])('carries AI popup attribution for $entryPoint', async (attribution) => {
    const { result } = renderHook(() => useSnowflakeAiLoginPopup(attribution), {
        wrapper: createWrapper(),
    });
    act(() => result.current.mutate());
    await waitFor(() => expect(window.open).toHaveBeenCalledOnce());
    const url = new URL(vi.mocked(window.open).mock.calls[0][0]!.toString());
    expect(url.pathname).toBe('/api/v1/login/snowflake-ai');
    expect(url.searchParams.get('isPopup')).toBe('true');
    expect(url.searchParams.get('entryPoint')).toBe(attribution.entryPoint);
    expect(url.searchParams.get('project')).toBe(attribution.projectUuid);
    act(() =>
        onMessage(
            new MessageEvent('message', {
                origin: mocks.siteUrl,
                data: 'success',
            }),
        ),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(closePopup).toHaveBeenCalledOnce();
    expect(closeChannel).toHaveBeenCalledOnce();
});

it.each(['https://app.example', 'https://app.example/base', ''])(
    'keeps the ordinary Snowflake popup URL byte-identical for %s',
    async (siteUrl) => {
        mocks.siteUrl = siteUrl;
        const onLogin = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(
            () => useSnowflakeLoginPopup({ onLogin }),
            { wrapper: createWrapper() },
        );
        act(() => result.current.mutate());
        await waitFor(() =>
            expect(window.open).toHaveBeenCalledExactlyOnceWith(
                `${siteUrl}/api/v1/login/snowflake?isPopup=true`,
                'login-popup',
                'width=600,height=600',
            ),
        );
        act(() =>
            onMessage(
                new MessageEvent('message', {
                    origin: siteUrl,
                    data: 'success',
                }),
            ),
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(onLogin).toHaveBeenCalledOnce();
    },
);
