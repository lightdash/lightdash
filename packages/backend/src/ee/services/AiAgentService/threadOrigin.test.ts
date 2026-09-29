import { getAppThreadCreatedFrom } from './threadOrigin';

describe('getAppThreadCreatedFrom', () => {
    it.each(['pat', 'service-account'] as const)(
        'records a thread started with a %s credential as created from the API',
        (authType) => {
            expect(getAppThreadCreatedFrom(authType)).toBe('api');
        },
    );

    it.each(['session', 'oauth'] as const)(
        'records a thread started by a person signed in with %s as created from the app',
        (authType) => {
            expect(getAppThreadCreatedFrom(authType)).toBe('web_app');
        },
    );
});
