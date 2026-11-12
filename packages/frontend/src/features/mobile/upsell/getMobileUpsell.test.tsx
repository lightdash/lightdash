import { act, render, screen } from '@testing-library/react';
import {
    createMemoryRouter,
    Navigate,
    RouterProvider,
    type RouteObject,
} from 'react-router';
import { describe, expect, it } from 'vitest';
import {
    createMobileUpsellLifecycle,
    useMobileUpsell,
} from './getMobileUpsell';

const HOME = '/projects/p1/home';
const CHART = '/projects/p1/saved/c1';
const SIGN_IN = '/m/sign-in';
const PICK_2 = '?mobileUpsell=2';
const INVALID = '?mobileUpsell=invalid';

let keys = 0;
const at = (pathname: string, search = '') => {
    keys += 1;
    return { key: `k${keys}`, pathname, search };
};

const routedApp = (initialSearch: string) => {
    const lifecycle = createMobileUpsellLifecycle(initialSearch);
    const Probe = () => (
        <output>{useMobileUpsell(lifecycle) ?? 'default'}</output>
    );
    const routes: RouteObject[] = [
        { path: '/', element: <Navigate to="/projects" replace /> },
        { path: '/projects', element: <Navigate to={HOME} /> },
        { path: HOME, element: <Probe /> },
        { path: SIGN_IN, element: <p>Sign in</p> },
    ];
    const router = createMemoryRouter(routes, {
        initialEntries: [`/${initialSearch}`],
    });
    lifecycle.observe(router.state.location);
    router.subscribe(({ location }) => lifecycle.observe(location));
    const view = render(<RouterProvider router={router} />);
    return { router, view };
};

const visit = (initialSearch: string, places: ReturnType<typeof at>[]) => {
    const lifecycle = createMobileUpsellLifecycle(initialSearch);
    return places.map((place) => lifecycle.resolve(place));
};

describe('mobile upsell selector lifecycle', () => {
    it('keeps the choice through the redirect to Home', () => {
        expect(visit(PICK_2, [at(HOME)])).toEqual([2]);
        const chain = [at('/', PICK_2), at('/projects'), at(HOME)];
        expect(visit(PICK_2, chain)).toEqual([2, 2, 2]);
    });

    it('returns the default after a later navigation without a selector', () => {
        const places = [at(HOME), at(CHART), at(HOME)];
        expect(visit(PICK_2, places)).toEqual([2, null, null]);
    });

    it('does not restore an earlier choice after an invalid value', () => {
        expect(visit(INVALID, [at(HOME), at(CHART)])).toEqual([null, null]);
        const atHome = [at(HOME, INVALID), at(CHART)];
        expect(visit(PICK_2, atHome)).toEqual([null, null]);
        const inRedirect = [at('/', INVALID), at('/projects'), at(HOME)];
        expect(visit(PICK_2, inRedirect)).toEqual([null, null, null]);
    });

    it('shows a history entry with a selector and defaults one without', () => {
        const lifecycle = createMobileUpsellLifecycle('');
        const withSelector = at(CHART, '?mobileUpsell=4');
        const withoutSelector = at(HOME);
        expect(lifecycle.resolve(withSelector)).toBe(4);
        expect(lifecycle.resolve(withoutSelector)).toBeNull();
        expect(lifecycle.resolve(withSelector)).toBe(4);
        expect(lifecycle.resolve(withoutSelector)).toBeNull();
    });

    it('shows an explicit valid choice and ignores an explicit invalid one', () => {
        expect(visit('', [at(HOME, '?mobileUpsell=6')])).toEqual([6]);
        const places = [at(HOME, '?mobileUpsell=7'), at(HOME)];
        expect(visit('?mobileUpsell=3', places)).toEqual([null, null]);
    });

    it('follows the app redirect, a later route and Back', async () => {
        const lifecycle = createMobileUpsellLifecycle(PICK_2);
        const Probe = () => (
            <output>{useMobileUpsell(lifecycle) ?? 'default'}</output>
        );
        const routes: RouteObject[] = [
            { path: '/', element: <Navigate to="/projects" replace /> },
            { path: '/projects', element: <Navigate to={HOME} /> },
            { path: HOME, element: <Probe /> },
            { path: CHART, element: <Probe /> },
        ];
        const router = createMemoryRouter(routes, {
            initialEntries: [`/${PICK_2}`],
        });
        render(<RouterProvider router={router} />);

        expect(await screen.findByText('2')).toBeInTheDocument();
        expect(router.state.location.search).toBe('');

        await act(() => router.navigate(CHART));
        expect(screen.getByText('default')).toBeInTheDocument();

        await act(() => router.navigate(-1));
        expect(router.state.location.pathname).toBe(HOME);
        expect(screen.getByText('default')).toBeInTheDocument();

        await act(() => router.navigate(`${HOME}?mobileUpsell=5`));
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('returns the default after Back from a route without the menu', async () => {
        const { router } = routedApp(PICK_2);
        expect(await screen.findByText('2')).toBeInTheDocument();

        await act(() => router.navigate(SIGN_IN));
        expect(screen.getByText('Sign in')).toBeInTheDocument();

        await act(() => router.navigate(-1));
        expect(router.state.location.pathname).toBe(HOME);
        expect(screen.getByText('default')).toBeInTheDocument();
    });

    it('keeps the choice on the same Home entry across renders', async () => {
        const { router, view } = routedApp(PICK_2);
        expect(await screen.findByText('2')).toBeInTheDocument();

        view.rerender(<RouterProvider router={router} />);
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('stays default after an invalid value and a route without the menu', async () => {
        const { router } = routedApp(INVALID);
        expect(await screen.findByText('default')).toBeInTheDocument();

        await act(() => router.navigate(SIGN_IN));
        await act(() => router.navigate(-1));
        expect(screen.getByText('default')).toBeInTheDocument();

        await act(() => router.navigate(HOME));
        expect(screen.getByText('default')).toBeInTheDocument();
    });
});
