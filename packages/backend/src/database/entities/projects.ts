import { Knex } from 'knex';

type DbProject = {
    project_id: number;
    project_uuid: string;
    name: string;
    created_at: Date;
    organization_id: number;
};

type CreateDbProject = Pick<DbProject, 'name' | 'organization_id'>;

export const createProject = async (
    db: Knex,
    data: CreateDbProject,
): Promise<DbProject> => {
    const results = await db<DbProject>('projects')
        .insert<CreateDbProject>(data)
        .returning('*');
    return results[0];
};
