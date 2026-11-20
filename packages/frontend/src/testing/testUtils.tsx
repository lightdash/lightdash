import {
    render,
    renderHook,
    type Queries,
    type queries,
    type RenderHookOptions,
    type RenderHookResult,
    type RenderOptions,
    type RenderResult,
} from '@testing-library/react';
import { type FC, type PropsWithChildren, type ReactElement } from 'react';
import { vi } from 'vitest';
import { ColumnWindowingContext } from '../components/common/Table/ColumnWindowingContext';
import ReactQueryProvider from '../providers/__mocks__/ReactQueryProvider';
import MantineBaseProvider from '../providers/MantineBaseProvider';
import MantineProvider from '../providers/MantineProvider';
import TrackingProvider from '../providers/Tracking/TrackingProvider';
import AppProviderMock, {
    type AppProviderMockProps,
} from './__mocks__/providers/AppProvider.mock';

vi.mock('src/providers/TrackingProvider');

type ProviderOptions = { columnWindowing?: boolean };

const getMockedProviders = (
    appMocks?: AppProviderMockProps['mocks'],
    { columnWindowing = false }: ProviderOptions = {},
) => {
    // eslint-disable-next-line react/only-export-components -- test utility, not a real module for fast refresh
    const ProviderWrapper: FC<PropsWithChildren> = ({ children }) => {
        return (
            <ReactQueryProvider>
                <MantineProvider env="test">
                    <MantineBaseProvider env="test">
                        <AppProviderMock mocks={appMocks}>
                            <ColumnWindowingContext.Provider
                                value={columnWindowing}
                            >
                                <TrackingProvider>{children}</TrackingProvider>
                            </ColumnWindowingContext.Provider>
                        </AppProviderMock>
                    </MantineBaseProvider>
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
    {
        columnWindowing,
        ...options
    }: RenderOptions<Q, Container, BaseElement> & ProviderOptions = {},
): RenderResult<Q, Container, BaseElement> {
    return render(ui, {
        wrapper: getMockedProviders(appMocks, { columnWindowing }),
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
    {
        columnWindowing,
        ...options
    }: RenderHookOptions<Props, Q, Container, BaseElement> &
        ProviderOptions = {},
): RenderHookResult<Result, Props> {
    return renderHook(hook, {
        wrapper: getMockedProviders(appMocks, { columnWindowing }),
        container: document.body,
        ...options,
    });
}
