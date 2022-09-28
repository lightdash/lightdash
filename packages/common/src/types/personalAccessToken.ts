export type PersonalAccessToken = {
    uuid?: string;
    createdAt: Date | string;
    expiresAt?: Date | string;
    description: string;
};

export type CreatePersonalAccessToken = Pick<
    PersonalAccessToken,
    'expiresAt' | 'description'
>;
