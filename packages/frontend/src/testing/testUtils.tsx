import {
    render,
    renderHook,
    type Queries,
    type RenderHookOptions,
    type RenderHookResult,
    type RenderOptions,
    type RenderResult,
    type queries,
} from '@testing-library/react';
import { type FC, type PropsWithChildren, type ReactElement } from 'react';
import { vi } from 'vitest';
import MantineProvider from '../providers/MantineProvider';
import ReactQueryProvider from '../providers/ReactQuery/ReactQueryProvider';
import TrackingProvider from '../providers/Tracking/TrackingProvider';
import AppProviderMock, {
    type AppProviderMockProps,
} from './__mocks__/providers/AppProvider.mock';

vi.mock('../providers/ReactQuery/ReactQueryProvider', async () => {
    const mock = await import('../providers/__mocks__/ReactQueryProvider');
    return { default: mock.default };
});
vi.mock('../providers/Tracking/TrackingProvider', async () => {
    const mock = await import(
        '../providers/__mocks__/Tracking/TrackingProvider'
    );
    return { default: mock.TrackingProvider };
});

const getMockedProviders = (appMocks?: AppProviderMockProps['mocks']) => {
    const ProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
        return (
            <ReactQueryProvider>
                <MantineProvider>
                    <AppProviderMock mocks={appMocks}>
                        <TrackingProvider>{children}</TrackingProvider>
                    </AppProviderMock>
                </MantineProvider>
            </ReactQueryProvider>
        );
    };

    return ProviderWrapper;
};

export function renderWithProviders<
    Q extends Queries = typeof queries,
    Container extends Element | DocumentFragment = HTMLElement,
    BaseElement extends Element | DocumentFragment = Container,
>(
    ui: ReactElement<any>,
    appMocks?: AppProviderMockProps['mocks'],
    options?: RenderOptions<Q, Container, BaseElement>,
): RenderResult<Q, Container, BaseElement> {
    return render(ui, {
        wrapper: getMockedProviders(appMocks),
        ...options,
    });
}

export function renderHookWithProviders<
    Result,
    Props,
    Q extends Queries = typeof queries,
    Container extends Element | DocumentFragment = HTMLElement,
    BaseElement extends Element | DocumentFragment = Container,
>(
    hook: (initialProps: Props) => Result,
    appMocks?: AppProviderMockProps['mocks'],
    options?: RenderHookOptions<Props, Q, Container, BaseElement>,
): RenderHookResult<Result, Props> {
    return renderHook(hook, {
        wrapper: getMockedProviders(appMocks),
        container: document.body,
        ...options,
    });
}
