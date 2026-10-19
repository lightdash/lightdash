import { type Request } from 'express';
import { resolveOAuthRouteOperation } from './routeOperation';
import { requireOAuthScopeOperation } from './unchecked';

const request = (name: string, baseUrl = '', path = '/') =>
    ({
        method: 'GET',
        baseUrl,
        route: {
            path,
            stack: [
                {
                    handle: Object.defineProperty(() => {}, 'name', {
                        value: name,
                    }),
                },
            ],
        },
    }) as Request;

it.each([
    'OrganizationController.getProjects',
    'SavedChartController.getChartHistory',
])(
    'resolves inventoried TSOA operation %s from the registered handler',
    (key) => {
        expect(resolveOAuthRouteOperation(request(key.replace('.', '_')))).toBe(
            key,
        );
    },
);
it('rejects an unreviewed TSOA handler', () => {
    expect(
        resolveOAuthRouteOperation(request('NewController_read')),
    ).toBeNull();
});
it('uses scope guard identity for handwritten routes', () => {
    const req = request('anonymous');
    req.route.stack.unshift({
        handle: requireOAuthScopeOperation('organizationRouter.getOnboarding'),
    });
    expect(resolveOAuthRouteOperation(req)).toBe(
        'organizationRouter.getOnboarding',
    );
});
it('does not mistake an unrelated route for a checked router operation', () => {
    expect(
        resolveOAuthRouteOperation(
            request('anonymous', '/other', '/:dashboardUuidOrSlug'),
        ),
    ).toBeNull();
});
it('resolves a checked handwritten router operation', () => {
    expect(
        resolveOAuthRouteOperation(
            request('anonymous', '/api/v1/dashboards', '/:dashboardUuidOrSlug'),
        ),
    ).toBe('dashboardRouter GET /:dashboardUuidOrSlug');
});
it('rejects missing route metadata', () => {
    expect(resolveOAuthRouteOperation({} as Request)).toBeNull();
});
it('prefers the terminal TSOA handler over an earlier scope guard', () => {
    const req = request('OrganizationController_getProjects');
    req.route.stack.unshift({
        handle: requireOAuthScopeOperation(
            'OrganizationController.getOrganization',
        ),
    });
    expect(resolveOAuthRouteOperation(req)).toBe(
        'OrganizationController.getProjects',
    );
});
