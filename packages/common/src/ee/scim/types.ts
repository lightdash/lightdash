import { type ScimSchemaType, type ServiceAccount } from '..';

export type SessionServiceAccount = {
    organizationUuid: string;
};

export interface ScimResource {
    schemas: string[];
    id: string;
    meta?: {
        resourceType?: string;
        created?: Date;
        lastModified?: Date;
        location?: string;
        version?: string;
    };
}

export interface LightdashScimExtension {
    /**
     * @deprecated - use ScimUser['roles'] instead. Learn more at https://docs.lightdash.com/references/scim-integration#lightdash-extension-schema-deprecated
     */
    role?: string;
}

export interface ScimUserRole {
    value: string;
    display?: string;
    type?: string;
    primary?: boolean;
}

export interface ScimUser extends ScimResource {
    schemas: string[];
    userName: string;
    name?: {
        givenName?: string;
        familyName?: string;
    };
    active?: boolean;
    emails?: {
        value: string;
        primary?: boolean;
    }[];
    roles?: ScimUserRole[];
    [ScimSchemaType.LIGHTDASH_USER_EXTENSION]?: LightdashScimExtension;
}

export interface ScimGroup extends ScimResource {
    schemas: string[];
    id: string;
    displayName: string;
    members?: ScimGroupMember[];
    meta: ScimResource['meta'] & {
        resourceType: 'Group';
        created: Date;
        lastModified: Date;
        location: string;
    };
}

export interface ScimGroupMember {
    value: string;
    display?: string;
}

export interface ScimRole extends ScimResource {
    schemas: ScimSchemaType.ROLE[];
    value: string;
    display?: string;
    type?: string; // A label indicating the role's function level (e.g.: Organization, Project - A, Project - B). Should help clients group roles and validate 1 role per type (aka org/project).
    supported: boolean;
    meta: ScimResource['meta'] & {
        resourceType: 'Role';
        created?: Date;
        lastModified?: Date;
        location: string;
    };
}

export type ScimErrorPayload = {
    /**
     * NOTE: this is taken from the SCIM spec here: https://datatracker.ietf.org/doc/html/rfc7644#section-3.7.3
     * A SCIM-specific error type that provides additional context for the error.
     * - 'invalidFilter': The specified filter syntax was invalid or the attribute and comparison combination is not supported.
     *   Applicable for GET (Section 3.4.2), POST (Search - Section 3.4.3), PATCH (Path Filter - Section 3.5.2).
     * - 'tooMany': The filter yields too many results for the server to process.
     *   Applicable for GET (Section 3.4.2), POST (Search - Section 3.4.3).
     * - 'uniqueness': One or more attribute values are already in use or reserved.
     *   Applicable for POST (Create - Section 3.3), PUT (Section 3.5.1), PATCH (Section 3.5.2).
     * - 'mutability': The modification is incompatible with the target attribute's mutability.
     *   Applicable for PUT (Section 3.5.1), PATCH (Section 3.5.2).
     * - 'invalidSyntax': The request body structure was invalid or did not conform to the schema.
     *   Applicable for POST (Search - Section 3.4.3, Create - Section 3.3, Bulk - Section 3.7), PUT (Section 3.5.1).
     * - 'invalidPath': The "path" attribute was invalid or malformed.
     *   Applicable for PATCH (Section 3.5.2).
     * - 'noTarget': The specified "path" did not yield an attribute that could be operated on.
     *   Applicable for PATCH (Section 3.5.2).
     * - 'invalidValue': A required value was missing, or the value specified was not compatible with the operation.
     *   Applicable for GET (Section 3.4.2), POST (Create - Section 3.3, Query - Section 3.4.3), PUT (Section 3.5.1), PATCH (Section 3.5.2).
     * - 'invalidVers': The specified SCIM protocol version is not supported.
     *   Applicable for GET (Section 3.4.2), POST (ALL), PUT (Section 3.5.1), PATCH (Section 3.5.2), DELETE (Section 3.6).
     * - 'sensitive': The request cannot be completed due to sensitive information passed in the URI.
     *   Applicable for GET (Section 3.4.2).
     */
    scimType?:
        | 'invalidFilter'
        | 'tooMany'
        | 'uniqueness'
        | 'mutability'
        | 'invalidSyntax'
        | 'invalidPath'
        | 'noTarget'
        | 'invalidValue'
        | 'invalidVers'
        | 'sensitive';

    /**
     * Array of schema URIs that describe the structure of the SCIM error response.
     * Typically includes "urn:ietf:params:scim:api:messages:2.0:Error".
     */
    schemas: ScimSchemaType.ERROR[];

    /**
     * Human-readable description of the error, providing details about why the error occurred.
     */
    detail: string;

    /**
     * HTTP status code as a string, indicating the status of the response.
     * For example: "400" for bad requests, "404" for not found, "500" for server errors.
     */
    status: string;
};

export interface ScimListResponse<T extends ScimResource> {
    schemas: ScimSchemaType.LIST_RESPONSE[];
    totalResults: number;
    itemsPerPage: number;
    startIndex: number;
    Resources: T[];
}

export interface ScimUpsertGroup {
    schemas: ScimSchemaType.GROUP[];
    displayName: string;
    members?: ScimGroupMember[];
}

export type ScimUpsertUser = Omit<ScimUser, 'id'> & {
    password?: string; // optional for create
    title?: string; // okta sends this on create
};

export type ApiCreateScimServiceAccountRequest = Pick<
    ServiceAccount,
    'expiresAt' | 'description'
>;

export interface ScimServiceProviderConfig {
    schemas: ScimSchemaType.SERVICE_PROVIDER_CONFIG[];
    documentationUri?: string;
    patch: {
        supported: boolean;
    };
    bulk: {
        supported: boolean;
        maxOperations?: number;
        maxPayloadSize?: number;
    };
    filter: {
        supported: boolean;
        maxResults?: number;
    };
    changePassword: {
        supported: boolean;
    };
    sort: {
        supported: boolean;
    };
    etag: {
        supported: boolean;
    };
    authenticationSchemes: {
        type: string;
        name: string;
        description: string;
        specUri?: string;
        documentationUri?: string;
        primary?: boolean;
    }[];
}

export interface ScimSchema extends ScimResource {
    schemas: ScimSchemaType.SCHEMA[];
    name?: string;
    description?: string;
    attributes: ScimSchemaAttribute[];
}

export interface ScimSchemaAttribute {
    name: string;
    type:
        | 'string'
        | 'boolean'
        | 'decimal'
        | 'integer'
        | 'dateTime'
        | 'reference'
        | 'complex';
    multiValued: boolean;
    description?: string;
    required: boolean;
    canonicalValues?: string[];
    caseExact: boolean;
    mutability: 'readOnly' | 'readWrite' | 'immutable' | 'writeOnly';
    returned: 'always' | 'never' | 'default' | 'request';
    uniqueness: 'none' | 'server' | 'global';
    subAttributes?: ScimSchemaAttribute[];
}

export interface ScimResourceType extends ScimResource {
    schemas: ScimSchemaType.RESOURCE_TYPE[];
    name: string;
    description?: string;
    endpoint: string;
    schema: string;
    schemaExtensions?: {
        schema: string;
        required: boolean;
    }[];
}
