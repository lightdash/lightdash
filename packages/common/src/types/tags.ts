import type { LightdashUser } from './user';

export type Tag = {
    tagUuid: string;
    projectUuid: string;
    name: string;
    createdAt: Date;
    createdBy: Pick<
        LightdashUser,
        'userUuid' | 'firstName' | 'lastName'
    > | null;
};
