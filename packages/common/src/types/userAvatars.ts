export const USER_AVATAR_GRADIENT_IDS = [
    'lilac',
    'blush',
    'amethyst',
    'sunrise',
    'slate',
] as const;

export type UserAvatarGradientId = (typeof USER_AVATAR_GRADIENT_IDS)[number];

export const isUserAvatarGradientId = (
    value: string,
): value is UserAvatarGradientId =>
    (USER_AVATAR_GRADIENT_IDS as readonly string[]).includes(value);

export const getUserAvatarGradient = (
    userUuid: string,
    override: UserAvatarGradientId | null,
): UserAvatarGradientId => {
    if (override) return override;
    let hash = 0;
    for (let i = 0; i < userUuid.length; i += 1) {
        hash = (hash * 31 + userUuid.charCodeAt(i)) % 2147483647;
    }
    return USER_AVATAR_GRADIENT_IDS[hash % USER_AVATAR_GRADIENT_IDS.length];
};

export const getUserAvatarUrl = (
    userUuid: string,
    contentHash: string,
): string => `/api/v1/users/${userUuid}/avatar/${contentHash}`;
