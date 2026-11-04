import { agentConnectionApiUrl } from './apiUrl';
import { slotFixture } from './fixtures';
import { canonicalInstanceUrl, validateSlot } from './schema';

it.each([
    'https://example.com',
    'https://example.com/lightdash',
    'https://example.com/tools/lightdash',
    'http://localhost:8080/lightdash',
    'http://127.0.0.1:8080/lightdash',
    'http://[::1]:8080/lightdash',
])('accepts canonical instance %s and one final slash', (instance) => {
    expect(canonicalInstanceUrl(instance)).toBe(instance);
    expect(canonicalInstanceUrl(`${instance}/`)).toBe(instance);
    expect(
        agentConnectionApiUrl(`${instance}/`, '/api/v1/user?check=true'),
    ).toBe(`${instance}/api/v1/user?check=true`);
});
it.each([
    'http://example.com/lightdash',
    'https://user@example.com/lightdash',
    'https://user:password@example.com/lightdash',
    'https://example.com/lightdash?query=true',
    'https://example.com/lightdash#fragment',
])('rejects canonical instance %s', (instance) => {
    expect(() => canonicalInstanceUrl(instance)).toThrow(
        'Invalid agent connection data.',
    );
});
it.each([
    'https://example.com/',
    'https://example.com/lightdash',
    'https://other.example.com',
])(
    'requires the stored resource to equal the instance exactly: %s',
    (resource) => {
        const slot = slotFixture();
        expect(validateSlot(slot, slot)).toEqual(slot);
        expect(() => validateSlot({ ...slot, resource }, slot)).toThrow(
            'Invalid agent connection data.',
        );
    },
);
it('rejects a stored instance with a trailing slash', () => {
    const slot = slotFixture();
    expect(() =>
        validateSlot(
            {
                ...slot,
                instanceUrl: `${slot.instanceUrl}/`,
                resource: `${slot.instanceUrl}/`,
            },
            slot,
        ),
    ).toThrow('Invalid agent connection data.');
});
it.each(['light%2edash', 'light%2fdash'])(
    'accepts encoded prefix %s for a relative path but rejects the full proof or approval URL',
    (prefix) => {
        // LIKELY DEFECT: Encoded dot and slash prefixes pass canonicalisation but full provider and approval URLs are refused.
        const instance = `https://example.com/${prefix}`;
        expect(canonicalInstanceUrl(instance)).toBe(instance);
        expect(agentConnectionApiUrl(instance, '/api/v1/user')).toBe(
            `${instance}/api/v1/user`,
        );
        expect(() =>
            agentConnectionApiUrl(instance, `${instance}/api/v1/user`),
        ).toThrow('must stay within the selected instance API');
        expect(() =>
            agentConnectionApiUrl(
                instance,
                `${instance}/api/v1/oauth/authorize`,
            ),
        ).toThrow('must stay within the selected instance API');
    },
);
it.each(['?', '#'])(
    'accepts an empty %s marker but cannot join an API path',
    (marker) => {
        // LIKELY DEFECT: An empty query or fragment survives canonicalisation and consumes the appended API path.
        const instance = `https://example.com/lightdash${marker}`;
        expect(canonicalInstanceUrl(instance)).toBe(instance);
        expect(() => agentConnectionApiUrl(instance, '/api/v1/user')).toThrow(
            'must stay within the selected instance API',
        );
    },
);
