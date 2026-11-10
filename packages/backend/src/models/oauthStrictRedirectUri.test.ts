import {
    isAllowedStrictRedirectUri,
    matchesRedirectUriStrict,
} from './oauthStrictRedirectUri';

describe('isAllowedStrictRedirectUri', () => {
    it.each([
        'https://app.example.com/cb',
        'http://localhost/cb',
        'http://127.0.0.1:1234/cb',
        'http://[::1]:1234/cb',
        'http://localhost:*/callback',
        'http://127.0.0.1:*/callback',
        'http://[::1]:*/callback',
        'com.lightdash.mobile:/oauth/callback',
        'com.lightdash.mobile://oauth/callback',
        'lightdash://oauth/callback',
        'cursor://anysphere.cursor-retrieval/oauth/callback',
        'vscode://extension/callback',
        'vscode-insiders://extension/callback',
        'windsurf://extension/callback',
    ])('allows %s', (uri) => {
        expect(isAllowedStrictRedirectUri(uri)).toBe(true);
    });

    it.each([
        'http://example.com/cb',
        'http://localhost.evil.example/cb',
        'http://127.1/cb',
        'https://user:pass@app.example.com/cb',
        'https://@app.example.com/cb',
        'com.lightdash.mobile://user@oauth/callback',
        'https://app.example.com/\\cb',
        'https://app.example.com/cb#fragment',
        'https://app.example.com/cb#',
        ['javascript', 'alert(1)'].join(':'),
        'data:text/html,hello',
        'vbscript:hello',
        'file:///tmp/cb',
        'blob:https://app.example.com/cb',
        'ftp://app.example.com/cb',
        'myapp://cb',
        'https://app.example.com/*',
        'https://*.example.com/cb',
        'https://localhost:*/cb',
        'http://localhost:*/cb*',
        'http://localhost:12*/cb',
        'http://localhost:99999/cb',
        'http://localhost:1234@evil.example/cb',
        'https://',
        'https:app.example.com/cb',
        ' https://app.example.com/cb',
        'https://app.example.com/cb\n',
    ])('refuses %s', (uri) => {
        expect(isAllowedStrictRedirectUri(uri)).toBe(false);
    });
});

describe('matchesRedirectUriStrict', () => {
    it.each([
        'https://app.example.com/cb?flow=oauth',
        'com.lightdash.mobile:/oauth/callback',
        'cursor://anysphere.cursor-retrieval/oauth/callback',
    ])('accepts exact %s', (uri) => {
        expect(matchesRedirectUriStrict(uri, uri)).toBe(true);
    });

    it.each([
        ['http://127.0.0.1:1234/cb', 'http://127.0.0.1:5678/cb'],
        ['http://localhost:1234/callback', 'http://localhost:*/callback'],
        ['http://[::1]:1234/cb?x=1', 'http://[::1]:*/cb?x=1'],
        ['http://localhost/cb', 'http://localhost:5678/cb'],
    ])('allows loopback port variance: %s / %s', (candidate, registered) => {
        expect(matchesRedirectUriStrict(candidate, registered)).toBe(true);
    });

    it.each([
        ['https://app.example.com/cb/', 'https://app.example.com/cb'],
        ['https://APP.example.com/cb', 'https://app.example.com/cb'],
        ['https://app.example.com/CB', 'https://app.example.com/cb'],
        ['https://app.example.com/cb?x=2', 'https://app.example.com/cb?x=1'],
        ['https://app.example.com/other', 'https://app.example.com/cb'],
        ['http://localhost:1234/other', 'http://localhost:*/callback'],
        ['http://localhost:1234/cb?x=2', 'http://localhost:5678/cb?x=1'],
        ['http://127.0.0.1:1234/cb', 'http://localhost:5678/cb'],
        ['http://LOCALHOST:1234/cb', 'http://localhost:5678/cb'],
        ['http://localhost:1234/a/../cb', 'http://localhost:5678/cb'],
        ['http://localhost:1234/cb?', 'http://localhost:5678/cb'],
        ['http://localhost:*/callback', 'http://localhost:*/callback'],
        ['https://app.example.com/cb', 'https://app.example.com/*'],
        ['https://app.example.com/cb', 'https://*.example.com/cb'],
        ['https://localhost:1/cb', 'https://localhost:2/cb'],
        ['myapp://cb', 'myapp://cb'],
        ['http://example.com/cb', 'http://example.com/cb'],
    ])('refuses %s / %s', (candidate, registered) => {
        expect(matchesRedirectUriStrict(candidate, registered)).toBe(false);
    });
});
