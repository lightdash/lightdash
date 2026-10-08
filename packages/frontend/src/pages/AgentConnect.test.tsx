import { FeatureFlags } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import PrivateRoute from '../components/PrivateRoute';
import AgentConnect from './AgentConnect';

const mocks = vi.hoisted(() => ({
    assign: vi.fn(),
    flag: vi.fn(),
    health: vi.fn(),
}));

vi.mock('../hooks/health/useHealth', () => ({ default: mocks.health }));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: mocks.flag,
}));
vi.mock('../components/LightdashLogo/LightdashLogo', () => ({
    default: () => null,
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: {
            data: { isAuthenticated: false },
            isInitialLoading: false,
            error: null,
        },
        user: { data: undefined, isInitialLoading: false, isError: false },
    }),
}));
vi.mock('../hooks/user/useAccount', () => ({
    useAccount: () => ({ data: undefined, isError: false }),
}));
vi.mock('../hooks/useEmailVerification', () => ({
    useEmailStatus: () => ({ isInitialLoading: false }),
}));
vi.mock('../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ rules: [], update: vi.fn() }),
}));

const project = 'b0ca6ddd-0ea1-419b-aed7-9a6dca81ca4c';
const renderPage = (query: string) =>
    render(
        <MantineProvider env="test">
            <MemoryRouter initialEntries={[`/agent/connect?${query}`]}>
                <AgentConnect />
            </MemoryRouter>
        </MantineProvider>,
    );

beforeEach(() => {
    mocks.assign.mockReset();
    mocks.flag.mockReturnValue({
        data: { enabled: true },
        isInitialLoading: false,
    });
    mocks.health.mockReturnValue({ data: { siteUrl: 'https://app.example' } });
    vi.stubGlobal('location', {
        href: window.location.href,
        origin: window.location.origin,
        assign: mocks.assign,
    });
});

afterEach(() => vi.unstubAllGlobals());

describe('AgentConnect', () => {
    it('sends a cold visitor to login with the full connection URL as the return location', () => {
        const search = `?project=${project}&redirect=%2Fagent-connected&entryPoint=mcp_connect_link`;
        const router = createMemoryRouter(
            [
                {
                    path: '/agent/connect',
                    element: (
                        <PrivateRoute>
                            <AgentConnect />
                        </PrivateRoute>
                    ),
                },
                { path: '/login', element: null },
            ],
            { initialEntries: [`/agent/connect${search}`] },
        );
        render(
            <MantineProvider env="test">
                <RouterProvider router={router} />
            </MantineProvider>,
        );
        expect(router.state.location.pathname).toBe('/login');
        expect(router.state.location.state).toMatchObject({
            from: { pathname: '/agent/connect', search },
        });
        expect(mocks.assign).not.toHaveBeenCalled();
    });

    it.each([
        '/agent-connected?client=browser',
        'https://app.example/agent-connected',
        'http://localhost:4321/done',
        'http://localhost:80/done',
        'http://127.0.0.1:65000/x',
    ])('forwards with the encoded redirect %s', (target) => {
        renderPage(`project=${project}&redirect=${encodeURIComponent(target)}`);
        expect(mocks.flag).toHaveBeenCalledWith(FeatureFlags.AgentIdentity);
        expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(
            `https://app.example/api/v1/login/snowflake-ai?redirect=${encodeURIComponent(target)}&project=${project}`,
        );
        expect(screen.getByText('Connecting your agent…')).toBeInTheDocument();
    });

    it.each([
        'https://evil.example/x',
        'https://localhost:4321/done',
        'http://localhost/done',
        'http://localhost@evil.example/',
        'http://user@localhost:4321/done',
        'javascript:alert(1)',
        '//evil.example/x',
        'http://[',
        '',
    ])('replaces the disallowed or absent redirect %s', (redirect) => {
        renderPage(
            `project=${project}&redirect=${encodeURIComponent(redirect)}`,
        );
        expect(mocks.assign).toHaveBeenCalledExactlyOnceWith(
            `https://app.example/api/v1/login/snowflake-ai?redirect=%2Fagent-connected&project=${project}`,
        );
    });

    it.each(['mcp_connect_link', 'cli', 'unrecognised value+&'])(
        'forwards the entry point unchanged: %s',
        (entryPoint) => {
            renderPage(new URLSearchParams({ project, entryPoint }).toString());
            const url = new URL(mocks.assign.mock.calls[0][0]);
            expect(url.searchParams.get('entryPoint')).toBe(entryPoint);
            expect(url.searchParams.get('project')).toBe(project);
        },
    );

    it('explains when the feature flag is off', () => {
        mocks.flag.mockReturnValue({
            data: { enabled: false },
            isInitialLoading: false,
        });
        renderPage(`project=${project}`);
        expect(
            screen.getByText(
                'Agent connections are not enabled for your account.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'My warehouse connections' }),
        ).toHaveAttribute('href', '/generalSettings/myWarehouseConnections');
        expect(mocks.assign).not.toHaveBeenCalled();
    });

    it.each(['', 'project=invalid'])(
        'explains a missing or invalid project: %s',
        (query) => {
            renderPage(query);
            expect(
                screen.getByText(
                    'This agent connection link is missing a valid project.',
                ),
            ).toBeInTheDocument();
            expect(mocks.assign).not.toHaveBeenCalled();
        },
    );

    it('waits for the feature flag before forwarding', () => {
        mocks.flag.mockReturnValue({ data: undefined, isInitialLoading: true });
        renderPage(`project=${project}`);
        expect(screen.getByText('Connecting your agent…')).toBeInTheDocument();
        expect(mocks.assign).not.toHaveBeenCalled();
    });
});
