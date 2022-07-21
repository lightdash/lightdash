import { SpaceQuery } from './savedCharts';

export type Space = {
    organizationUuid: string;
    uuid: string;
    name: string;
    queries: SpaceQuery[];
    projectUuid: string;
};

export type CreateSpace = Pick<Space, 'name'>;

export type UpdateSpace = Pick<Space, 'name'>;
