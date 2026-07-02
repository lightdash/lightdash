import {
    generateAvatarMeshBackgroundImage,
    generateAvatarMeshBorderColor,
    getAvatarMeshClassName,
    getContrastTextColor,
    getUserAvatarGradient,
    getUserAvatarUrl,
    hexToRgba,
    isHexColorString,
    isUserAvatarColorValue,
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

describe('isHexColorString', () => {
    it('accepts 6-digit hex colors and rejects everything else', () => {
        expect(isHexColorString('#5e4cff')).toBe(true);
        expect(isHexColorString('#5E4CFF')).toBe(true);
        expect(isHexColorString('#fff')).toBe(false);
        expect(isHexColorString('5e4cff')).toBe(false);
        expect(isHexColorString('not-a-color')).toBe(false);
    });
});

describe('isUserAvatarColorValue', () => {
    it('accepts preset ids and hex colors, rejects everything else', () => {
        expect(isUserAvatarColorValue('lilac')).toBe(true);
        expect(isUserAvatarColorValue('#5e4cff')).toBe(true);
        expect(isUserAvatarColorValue('not-a-color')).toBe(false);
    });
});

describe('hexToRgba', () => {
    it('converts a hex color to an rgba string with the given alpha', () => {
        expect(hexToRgba('#5e4cff', 0.4)).toBe('rgba(94, 76, 255, 0.4)');
    });
});

describe('generateAvatarMeshBackgroundImage', () => {
    it('produces a layered background-image using the base hex color', () => {
        const result = generateAvatarMeshBackgroundImage('#5e4cff');
        expect(result).toContain('#5e4cff');
        expect(result).toContain('radial-gradient');
        expect(result).toContain('linear-gradient');
    });
});

describe('generateAvatarMeshBorderColor', () => {
    it('returns an rgba border color derived from the base hex', () => {
        expect(generateAvatarMeshBorderColor('#5e4cff')).toBe(
            'rgba(94, 76, 255, 0.4)',
        );
    });
});

describe('getAvatarMeshClassName', () => {
    it('derives a stable, lowercase class name from the hex color', () => {
        expect(getAvatarMeshClassName('#5E4CFF')).toBe('avatar-mesh-5e4cff');
    });
});

describe('getContrastTextColor', () => {
    it('picks white text on dark backgrounds', () => {
        expect(getContrastTextColor('#5e4cff')).toBe('white');
        expect(getContrastTextColor('#0a0a0a')).toBe('white');
    });

    it('picks black text on light backgrounds', () => {
        expect(getContrastTextColor('#f5f5f5')).toBe('black');
        expect(getContrastTextColor('#ffe680')).toBe('black');
    });
});
