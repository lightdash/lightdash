import { getMcpAppRedirectPath } from './mcpAppRedirectPath';

const siteUrl = 'https://app.lightdash.example';

describe('getMcpAppRedirectPath', () => {
    it.each([
        [
            '/projects/p1/tables/orders?create_saved_chart_version=x',
            '/projects/p1/tables/orders?create_saved_chart_version=x',
        ],
        [
            'https://app.lightdash.example/projects/p1/dashboards/d1#tile',
            '/projects/p1/dashboards/d1#tile',
        ],
        ['projects/p1/home', '/projects/p1/home'],
    ])('keeps a same-origin target %s', (redirect, expected) => {
        expect(getMcpAppRedirectPath(redirect, siteUrl)).toBe(expected);
    });

    it.each([
        ['https://evil.example/projects'],
        ['//evil.example/projects'],
        ['http://app.lightdash.example/projects'],
        ['data:text/html,hello'],
        [undefined],
        [['/a', '/b']],
    ])('falls back to the home page for %s', (redirect) => {
        expect(getMcpAppRedirectPath(redirect, siteUrl)).toBe('/');
    });
});
