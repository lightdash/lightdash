import { mintPreviewToken, verifyPreviewToken } from './appPreviewToken';

const secrets = (active: string, ...fallbacks: string[]) => ({
    active,
    fallbacks,
    all: [active, ...fallbacks],
});

const oldOnly = secrets('old secret');
const newOnly = secrets('new secret');
const newActiveOldFallback = secrets('new secret', 'old secret');
const oldActiveNewFallback = secrets('old secret', 'new secret');

const appUuid = '0b7a5a1e-6a70-4c65-8b0f-8c1a9c2f1a11';
const mint = (keyring: ReturnType<typeof secrets>) =>
    mintPreviewToken(
        keyring,
        appUuid,
        3,
        'user-uuid',
        'organization-uuid',
        'project-uuid',
    );

describe('app preview tokens across secret rotation', () => {
    test('mints with the active secret only', () => {
        const token = mint(newActiveOldFallback);
        expect(verifyPreviewToken(token, newOnly, appUuid, 3).ok).toBe(true);
        expect(verifyPreviewToken(token, oldOnly, appUuid, 3).ok).toBe(false);
    });

    test('verifies tokens from either secret under both orderings', () => {
        const oldToken = mint(oldOnly);
        const newToken = mint(newOnly);
        for (const keyring of [newActiveOldFallback, oldActiveNewFallback]) {
            expect(verifyPreviewToken(oldToken, keyring, appUuid, 3).ok).toBe(
                true,
            );
            expect(verifyPreviewToken(newToken, keyring, appUuid, 3).ok).toBe(
                true,
            );
        }
    });

    test('returns the payload on success', () => {
        const result = verifyPreviewToken(
            mint(oldOnly),
            newActiveOldFallback,
            appUuid,
            3,
        );
        expect(result).toMatchObject({
            ok: true,
            payload: {
                appUuid,
                version: 3,
                userUuid: 'user-uuid',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
            },
        });
    });

    test('rejects tokens signed with an unknown secret', () => {
        const token = mint(secrets('unknown secret'));
        expect(
            verifyPreviewToken(token, newActiveOldFallback, appUuid, 3),
        ).toEqual({
            ok: false,
            status: 403,
            message: 'Invalid or expired preview token',
        });
    });

    test('rejects a missing token', () => {
        expect(
            verifyPreviewToken(undefined, newActiveOldFallback, appUuid, 3),
        ).toEqual({
            ok: false,
            status: 401,
            message: 'Missing preview token',
        });
    });

    test('rejects a mismatched app or version', () => {
        const token = mint(newActiveOldFallback);
        expect(
            verifyPreviewToken(token, newActiveOldFallback, appUuid, 4).ok,
        ).toBe(false);
        expect(
            verifyPreviewToken(
                token,
                newActiveOldFallback,
                '11111111-1111-4111-8111-111111111111',
                3,
            ).ok,
        ).toBe(false);
    });

    test('rejects an expired token even with a fallback configured', () => {
        vi.useFakeTimers();
        try {
            const token = mint(oldOnly);
            vi.advanceTimersByTime(2 * 60 * 60 * 1000);
            expect(
                verifyPreviewToken(token, newActiveOldFallback, appUuid, 3).ok,
            ).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
});
