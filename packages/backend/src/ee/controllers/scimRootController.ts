/* eslint-disable class-methods-use-this */
import {
    ScimListResponse,
    ScimResourceType,
    ScimSchema,
    ScimServiceProviderConfig,
} from '@lightdash/common';
import {
    Get,
    Hidden,
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
@Hidden()
@Tags('SCIM')
export class ScimRootController extends BaseController {
    /**
     * Root SCIM endpoint for validating SCIM configuration
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
     * @param req express request
     */
    @Get('/Schemas')
    @OperationId('GetScimSchemas')
    @Response<ScimListResponse<ScimSchema>>('200', 'Success')
    async getSchemas(
        @Request() req: express.Request,
    ): Promise<ScimListResponse<ScimSchema>> {
        return ScimService.getSchemas();
    }

    /**
     * Get individual SCIM schema
     * @param req express request
     * @param schemaId schema identifier
     */
    @Get('/Schemas/{schemaId}')
    @OperationId('GetScimSchema')
    @Response<ScimSchema>('200', 'Success')
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
     * @param req express request
     */
    @Get('/ResourceTypes')
    @OperationId('GetScimResourceTypes')
    @Response<ScimListResponse<ScimResourceType>>('200', 'Success')
    async getResourceTypes(
        @Request() req: express.Request,
    ): Promise<ScimListResponse<ScimResourceType>> {
        return ScimService.getResourceTypes();
    }

    /**
     * Get individual SCIM resource type
     * @param req express request
     * @param resourceTypeId resource type identifier
     */
    @Get('/ResourceTypes/{resourceTypeId}')
    @OperationId('GetScimResourceType')
    @Response<ScimResourceType>('200', 'Success')
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
