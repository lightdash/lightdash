import { isPlainHttpInternalHostRequest } from './internalHttpHost';

const INTERNAL = 'http://lightdash.lightdash.svc.cluster.local:8080';
const request = (host: string | undefined, secure = false) => ({
    secure,
    headers: { host },
});

describe('isPlainHttpInternalHostRequest', () => {
    it('matches a plain http request to the internal host', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('lightdash.lightdash.svc.cluster.local:8080'),
                INTERNAL,
            ),
        ).toBe(true);
    });

    it('ignores host header casing', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('Lightdash.lightdash.svc.cluster.local:8080'),
                INTERNAL,
            ),
        ).toBe(true);
    });

    it('does not match the public host', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('lightdash.example.com'),
                INTERNAL,
            ),
        ).toBe(false);
    });

    it('does not match a different port on the internal host', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('lightdash.lightdash.svc.cluster.local:3000'),
                INTERNAL,
            ),
        ).toBe(false);
    });

    it('does not match a request served over https', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('lightdash.lightdash.svc.cluster.local:8080', true),
                INTERNAL,
            ),
        ).toBe(false);
    });

    it('does not match when the internal host is https', () => {
        expect(
            isPlainHttpInternalHostRequest(
                request('lightdash.lightdash.svc.cluster.local:8080'),
                'https://lightdash.lightdash.svc.cluster.local:8080',
            ),
        ).toBe(false);
    });

    it('does not match a missing host header or invalid internal host', () => {
        expect(
            isPlainHttpInternalHostRequest(request(undefined), INTERNAL),
        ).toBe(false);
        expect(
            isPlainHttpInternalHostRequest(request('lightdash:8080'), 'nope'),
        ).toBe(false);
    });
});
