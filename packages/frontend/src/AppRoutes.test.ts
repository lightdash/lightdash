import { matchRoutes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from './AppRoutes';

const regularResourcePaths = [
    '/projects/jaffle-shop/saved/orders/view',
    '/projects/jaffle-shop/dashboards/sales/view',
    '/projects/jaffle-shop/dashboards/sales/view/tabs/overview',
];

const matchedPaths = (pathname: string) =>
    matchRoutes(APP_ROUTES, pathname)?.map(({ route }) => route.path);

const originalWidth = window.innerWidth;
const resizeTo = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
    });
    window.dispatchEvent(new Event('resize'));
};

afterEach(() => resizeTo(originalWidth));

describe('responsive route selection', () => {
    it.each(regularResourcePaths)(
        'keeps %s on the app route when the viewport changes',
        (pathname) => {
            resizeTo(1280);
            const desktopMatches = matchedPaths(pathname);

            resizeTo(390);

            expect(matchedPaths(pathname)).toEqual(desktopMatches);
            expect(desktopMatches).toBeDefined();
            expect(desktopMatches).not.toContain('/minimal');
        },
    );

    it('matches minimal charts and dashboards only with an explicit minimal URL', () => {
        expect(
            matchedPaths('/minimal/projects/jaffle-shop/saved/orders'),
        ).toContain('/minimal');
        expect(
            matchedPaths('/minimal/projects/jaffle-shop/dashboards/sales'),
        ).toContain('/minimal');
    });
});
