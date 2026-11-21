import { getSalesforceSignInUrl } from './salesforceConnection';

describe('getSalesforceSignInUrl', () => {
    it('starts sign-in with the name, keeping a reconnected source', () => {
        const url = new URL(
            getSalesforceSignInUrl(
                'project-1',
                { name: ' Pipeline ' },
                'connection-1',
                'settings',
            ),
            'https://lightdash.example.com',
        );
        expect(url.pathname).toBe(
            '/api/v1/ee/projects/project-1/live-sources/salesforce/oauth/start',
        );
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            name: 'Pipeline',
            connectionUuid: 'connection-1',
        });
    });
});
