import { Knex } from 'knex';

export const OrganizationDesignFilesTableName = 'organization_design_files';

export type DbOrganizationDesignFile = {
    file_uuid: string;
    design_uuid: string;
    kind: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type DbOrganizationDesignFileIn = Pick<
    DbOrganizationDesignFile,
    | 'file_uuid'
    | 'design_uuid'
    | 'kind'
    | 'filename'
    | 'content_type'
    | 'size_bytes'
    | 'created_by_user_uuid'
>;

export type OrganizationDesignFilesTable = Knex.CompositeTableType<
    DbOrganizationDesignFile,
    DbOrganizationDesignFileIn
>;
