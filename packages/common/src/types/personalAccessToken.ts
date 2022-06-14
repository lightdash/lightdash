export type PersonalAccessToken = {
    uuid?: string;
    createdAt: Date;
    expiresAt: Date | undefined;
    description: string;
};

export type CreatePersonalAccessToken = Pick<
    PersonalAccessToken,
    'expiresAt' | 'description'
>;
