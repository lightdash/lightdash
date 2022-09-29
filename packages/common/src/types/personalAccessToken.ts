export type PersonalAccessToken = {
    uuid?: string;
    createdAt: string;
    expiresAt?: string;
    description: string;
};

export type CreatePersonalAccessToken = Pick<
    PersonalAccessToken,
    'expiresAt' | 'description'
>;
