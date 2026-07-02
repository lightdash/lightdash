import {
    getUserAvatarGradient,
    getUserAvatarUrl,
    isUserAvatarGradientId,
    USER_AVATAR_GRADIENT_IDS,
} from './userAvatars';

describe('getUserAvatarGradient', () => {
    it('is deterministic for the same uuid', () => {
        const uuid = 'b264d83a-9000-426a-85ec-3f9c20f368ce';
        expect(getUserAvatarGradient(uuid, null)).toBe(
            getUserAvatarGradient(uuid, null),
        );
    });

    it('always returns a valid gradient id', () => {
        const uuids = [
            'b264d83a-9000-426a-85ec-3f9c20f368ce',
            '00000000-0000-0000-0000-000000000000',
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
        ];
        uuids.forEach((uuid) => {
            expect(USER_AVATAR_GRADIENT_IDS).toContain(
                getUserAvatarGradient(uuid, null),
            );
        });
    });

    it('returns the override when set', () => {
        expect(
            getUserAvatarGradient(
                'b264d83a-9000-426a-85ec-3f9c20f368ce',
                'lilac',
            ),
        ).toBe('lilac');
    });

    it('spreads different uuids across gradients', () => {
        const results = new Set(
            Array.from({ length: 64 }, (_, i) =>
                getUserAvatarGradient(
                    `0000000${i.toString(16)}-0000-0000-0000-00000000000${(
                        i % 16
                    ).toString(16)}`,
                    null,
                ),
            ),
        );
        expect(results.size).toBeGreaterThan(3);
    });
});

describe('isUserAvatarGradientId', () => {
    it('accepts known ids and rejects unknown strings', () => {
        expect(isUserAvatarGradientId('lilac')).toBe(true);
        expect(isUserAvatarGradientId('not-a-gradient')).toBe(false);
    });
});

describe('getUserAvatarUrl', () => {
    it('builds the versioned api path', () => {
        expect(getUserAvatarUrl('some-uuid', 'abc123')).toBe(
            '/api/v1/users/some-uuid/avatar/abc123',
        );
    });
});
