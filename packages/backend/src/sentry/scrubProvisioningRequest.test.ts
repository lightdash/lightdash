import type { ErrorEvent } from '@sentry/node';
import { scrubProvisioningRequest } from './scrubProvisioningRequest';

const eventFor = (url: string): ErrorEvent => ({
    type: undefined,
    request: {
        url,
        headers: { Authorization: 'Bearer secret', 'user-agent': 'worker' },
        data: { ownerPassword: 'secret' },
    },
});

describe('scrubProvisioningRequest', () => {
    it('removes the token and body from provisioning requests', () => {
        const scrubbed = scrubProvisioningRequest(
            eventFor(
                'https://lightdash.example/api/v1/provisioning/organizations',
            ),
        );

        expect(scrubbed.request?.headers).toEqual({ 'user-agent': 'worker' });
        expect(scrubbed.request?.data).toBeUndefined();
    });

    it('leaves other requests as they are', () => {
        const event = eventFor('https://lightdash.example/api/v1/org');

        expect(scrubProvisioningRequest(event)).toBe(event);
    });
});
