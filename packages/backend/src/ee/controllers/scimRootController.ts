/* eslint-disable class-methods-use-this */
import {
    ScimListResponse,
    ScimResourceType,
    ScimSchema,
    ScimSchemaType,
    ScimServiceProviderConfig,
} from '@lightdash/common';
import {
    Example,
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../../controllers/baseController';
import { isScimAuthenticated } from '../authentication';
import { ScimService } from '../services/ScimService/ScimService';

@Route('/api/v1/scim/v2')
@Tags('SCIM')
export class ScimRootController extends BaseController {
    /**
     * Root SCIM endpoint for validating SCIM configuration
     * @summary Root check
     * @param req express request
     */
    @Middlewares([isScimAuthenticated])
    @Get('/')
    @OperationId('GetScimRoot')
    @Response('200', 'Success')
    async getScimRoot(@Request() req: express.Request): Promise<void> {
        // Return empty success response as expected by identity providers
        this.setStatus(200);
    }

    /**
     * Get SCIM service provider configuration
     * @summary Provider config
     * @param req express request
     */
    @Get('/ServiceProviderConfig')
    @OperationId('GetScimServiceProviderConfig')
    @Response<ScimServiceProviderConfig>('200', 'Success')
    async getServiceProviderConfig(
        @Request() req: express.Request,
    ): Promise<ScimServiceProviderConfig> {
        return ScimService.getServiceProviderConfig();
    }

    /**
     * Get SCIM schemas
     * @summary List schemas
     * @param req express request
     */
    @Get('/Schemas')
    @OperationId('GetScimSchemas')
    @Response<ScimListResponse<ScimSchema>>('200', 'Success')
    @Example<ScimListResponse<ScimSchema>>({
        schemas: [ScimSchemaType.LIST_RESPONSE],
        totalResults: 1,
        itemsPerPage: 1,
        startIndex: 1,
        Resources: [
            {
                schemas: [ScimSchemaType.SCHEMA],
                id: 'urn:ietf:params:scim:schemas:extension:2.0:Role',
                name: 'Role',
                description: 'Role Schema',
                attributes: [
                    {
                        name: 'value',
                        type: 'string',
                        multiValued: false,
                        description: 'The value of the role',
                        required: true,
                        caseExact: false,
                        mutability: 'readOnly',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                    {
                        name: 'display',
                        type: 'string',
                        multiValued: false,
                        description: 'Human-readable name for the role',
                        required: false,
                        caseExact: false,
                        mutability: 'readOnly',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                    {
                        name: 'type',
                        type: 'string',
                        multiValued: false,
                        description: 'Label indicating the role function',
                        required: false,
                        caseExact: false,
                        mutability: 'readOnly',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                    {
                        name: 'supported',
                        type: 'boolean',
                        multiValued: false,
                        description: 'Boolean indicating if the role is usable',
                        required: true,
                        caseExact: false,
                        mutability: 'readOnly',
                        returned: 'default',
                        uniqueness: 'none',
                    },
                ],
            },
        ],
    })
    async getSchemas(
        @Request() req: express.Request,
    ): Promise<ScimListResponse<ScimSchema>> {
        return ScimService.getSchemas();
    }

    /**
     * Get individual SCIM schema
     * @summary Get schema
     * @param req express request
     * @param schemaId schema identifier
     */
    @Get('/Schemas/{schemaId}')
    @OperationId('GetScimSchema')
    @Response<ScimSchema>('200', 'Success')
    @Example<ScimSchema>({
        schemas: [ScimSchemaType.SCHEMA],
        id: 'urn:ietf:params:scim:schemas:extension:2.0:Role',
        name: 'Role',
        description: 'Role Schema',
        attributes: [
            {
                name: 'value',
                type: 'string',
                multiValued: false,
                description: 'The value of the role',
                required: true,
                caseExact: false,
                mutability: 'readOnly',
                returned: 'default',
                uniqueness: 'none',
            },
            {
                name: 'display',
                type: 'string',
                multiValued: false,
                description: 'Human-readable name for the role',
                required: false,
                caseExact: false,
                mutability: 'readOnly',
                returned: 'default',
                uniqueness: 'none',
            },
            {
                name: 'type',
                type: 'string',
                multiValued: false,
                description: 'Label indicating the role function',
                required: false,
                caseExact: false,
                mutability: 'readOnly',
                returned: 'default',
                uniqueness: 'none',
            },
            {
                name: 'supported',
                type: 'boolean',
                multiValued: false,
                description: 'Boolean indicating if the role is usable',
                required: true,
                caseExact: false,
                mutability: 'readOnly',
                returned: 'default',
                uniqueness: 'none',
            },
        ],
    })
    async getSchema(
        @Request() req: express.Request,
        @Path() schemaId: string,
    ): Promise<ScimSchema> {
        const schemasResponse = ScimService.getSchemas();
        const schema = schemasResponse.Resources.find((s) => s.id === schemaId);

        if (!schema) {
            this.setStatus(404);
            throw new Error(`Schema ${schemaId} not found`);
        }

        return schema;
    }

    /**
     * Get SCIM resource types
     * @summary List resource types
     * @param req express request
     */
    @Get('/ResourceTypes')
    @OperationId('GetScimResourceTypes')
    @Response<ScimListResponse<ScimResourceType>>('200', 'Success')
    @Example<ScimListResponse<ScimResourceType>>({
        schemas: [ScimSchemaType.LIST_RESPONSE],
        totalResults: 3,
        itemsPerPage: 3,
        startIndex: 1,
        Resources: [
            {
                schemas: [ScimSchemaType.RESOURCE_TYPE],
                id: 'User',
                name: 'User',
                description: 'User Account',
                endpoint: '/Users',
                schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
                schemaExtensions: [
                    {
                        schema: 'urn:lightdash:params:scim:schemas:extension:2.0:User',
                        required: false,
                    },
                ],
                meta: {
                    resourceType: 'ResourceType',
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/ResourceTypes/User',
                },
            },
            {
                schemas: [ScimSchemaType.RESOURCE_TYPE],
                id: 'Group',
                name: 'Group',
                description: 'Group',
                endpoint: '/Groups',
                schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
                meta: {
                    resourceType: 'ResourceType',
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/ResourceTypes/Group',
                },
            },
            {
                schemas: [ScimSchemaType.RESOURCE_TYPE],
                id: 'Role',
                name: 'Role',
                description: 'Role',
                endpoint: '/Roles',
                schema: 'urn:ietf:params:scim:schemas:extension:2.0:Role',
                meta: {
                    resourceType: 'ResourceType',
                    location:
                        'https://<tenant>.lightdash.cloud/api/v1/scim/v2/ResourceTypes/Role',
                },
            },
        ],
    })
    async getResourceTypes(
        @Request() req: express.Request,
    ): Promise<ScimListResponse<ScimResourceType>> {
        return ScimService.getResourceTypes();
    }

    /**
     * Get individual SCIM resource type
     * @summary Get resource type
     * @param req express request
     * @param resourceTypeId resource type identifier
     */
    @Get('/ResourceTypes/{resourceTypeId}')
    @OperationId('GetScimResourceType')
    @Response<ScimResourceType>('200', 'Success')
    @Example<ScimResourceType>({
        schemas: [ScimSchemaType.RESOURCE_TYPE],
        id: 'User',
        name: 'User',
        description: 'User Account',
        endpoint: '/Users',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        schemaExtensions: [
            {
                schema: 'urn:lightdash:params:scim:schemas:extension:2.0:User',
                required: false,
            },
        ],
        meta: {
            resourceType: 'ResourceType',
            location:
                'https://<tenant>.lightdash.cloud/api/v1/scim/v2/ResourceTypes/User',
        },
    })
    async getResourceType(
        @Request() req: express.Request,
        @Path() resourceTypeId: string,
    ): Promise<ScimResourceType> {
        const resourceTypesResponse = ScimService.getResourceTypes();
        const resourceType = resourceTypesResponse.Resources.find(
            (rt) => rt.id === resourceTypeId,
        );

        if (!resourceType) {
            this.setStatus(404);
            throw new Error(`Resource type ${resourceTypeId} not found`);
        }

        return resourceType;
    }
}
