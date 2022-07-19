import { SavedChart } from './savedCharts';

export type SpaceQuery = Pick<
    SavedChart,
    'uuid' | 'name' | 'updatedAt' | 'updatedByUser' | 'description'
>;

export type Space = {
    organizationUuid: string;
    uuid: string;
    name: string;
    queries: SpaceQuery[];
    projectUuid: string;
};

export type CreateSpace = Pick<Space, 'name'>;

export type UpdateSpace = Pick<Space, 'name'>;
