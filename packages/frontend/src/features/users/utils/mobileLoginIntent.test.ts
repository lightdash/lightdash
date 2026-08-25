import {
    getMobileLoginIntentFromRedirect,
    setMobileLoginIntentOnRedirect,
} from './mobileLoginIntent';

describe('mobileLoginIntent', () => {
    const origin = 'https://lightdash.example';
    const authorizeUrl =
        '/api/v1/oauth/authorize?client_id=mobile&redirect_uri=lightdash%3A%2F%2Fcallback&state=request-state';

    it.each(['sso', 'local'] as const)(
        'reads the %s intent from the outer authorization request',
        (intent) => {
            expect(
                getMobileLoginIntentFromRedirect(
                    `${authorizeUrl}&mobile_login_intent=${intent}`,
                    origin,
                ),
            ).toBe(intent);
        },
    );

    it.each([undefined, 'other'])(
        'ignores an unsupported %s intent',
        (intent) => {
            expect(
                getMobileLoginIntentFromRedirect(
                    `${authorizeUrl}${
                        intent ? `&mobile_login_intent=${intent}` : ''
                    }`,
                    origin,
                ),
            ).toBeUndefined();
        },
    );

    it('ignores an intent outside the outer authorization route', () => {
        expect(
            getMobileLoginIntentFromRedirect(
                '/projects/project-uuid?mobile_login_intent=sso',
                origin,
            ),
        ).toBeUndefined();
    });

    it('changes only the browser intent on the outer authorization request', () => {
        expect(
            setMobileLoginIntentOnRedirect(authorizeUrl, origin, 'sso'),
        ).toBe(`${authorizeUrl}&mobile_login_intent=sso`);
    });
});
