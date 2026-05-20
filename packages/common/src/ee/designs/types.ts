import { type ApiSuccess } from '../../types/api/success';

/**
 * The kind of file inside an organization design. The pipeline uses this
 * to decide where to place the file inside the sandbox (`css/`, `fonts/`,
 * `images/`) and which files to concatenate into the system-prompt skill
 * append (`instruction`).
 */
export const ORGANIZATION_DESIGN_FILE_KINDS = [
    'css',
    'font',
    'image',
    'instruction',
] as const;

export type OrganizationDesignFileKind =
    (typeof ORGANIZATION_DESIGN_FILE_KINDS)[number];

export type ApiOrganizationDesignFile = {
    fileUuid: string;
    kind: OrganizationDesignFileKind;
    filename: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
};

export type ApiOrganizationDesign = {
    designUuid: string;
    organizationUuid: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUserUuid: string | null;
    files: ApiOrganizationDesignFile[];
};

export type CreateOrganizationDesignRequest = {
    name: string;
    description?: string;
};

export type UpdateOrganizationDesignRequest = {
    name?: string;
    description?: string | null;
};

export type ApiOrganizationDesignResponse = ApiSuccess<ApiOrganizationDesign>;

export type ApiOrganizationDesignsResponse = ApiSuccess<
    ApiOrganizationDesign[]
>;

export type ApiOrganizationDesignFileResponse =
    ApiSuccess<ApiOrganizationDesignFile>;
