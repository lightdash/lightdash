export * from './AiAgent';
export * from './commercialFeatureFlags';
export * from './embed';
export * from './scim/errors';
export * from './scim/types';
export * from './serviceAccounts/types';

export enum ScimSchemaType {
    ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error',
    USER = 'urn:ietf:params:scim:schemas:core:2.0:User',
    GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group',
    ROLE = 'urn:ietf:params:scim:schemas:extension:2.0:Role',
    LIST_RESPONSE = 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
    SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema',
    PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
    LIGHTDASH_USER_EXTENSION = 'urn:lightdash:params:scim:schemas:extension:2.0:User',
    SERVICE_PROVIDER_CONFIG = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    RESOURCE_TYPE = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
}
