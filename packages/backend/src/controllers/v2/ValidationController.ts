import {
    ApiErrorPayload,
    ApiPaginatedValidateResponse,
    ValidationErrorType,
    ValidationSourceType,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/validate')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Validation')
export class ValidationControllerV2 extends BaseController {
    /**
     * Get paginated validation results for a project with search, filter, and sort support.
     * @summary List validation results
     * @param projectUuid the projectId for the validation
     * @param req express request
     * @param page page number (1-indexed)
     * @param pageSize number of results per page
     * @param searchQuery search string to filter by name or error message
     * @param sortBy field to sort by
     * @param sortDirection sort direction
     * @param sourceTypes comma-separated list of source types to filter by
     * @param errorTypes comma-separated list of error types to filter by
     * @param includeChartConfigWarnings whether to include chart configuration warnings
     * @param fromSettings boolean for analytics tracking
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListValidationResults')
    async list(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page: number = 1,
        @Query() pageSize: number = 50,
        @Query() searchQuery?: string,
        @Query() sortBy?: 'name' | 'createdAt' | 'errorType' | 'source',
        @Query() sortDirection?: 'asc' | 'desc',
        @Query() sourceTypes?: string,
        @Query() errorTypes?: string,
        @Query() includeChartConfigWarnings?: boolean,
        @Query() fromSettings?: boolean,
    ): Promise<ApiPaginatedValidateResponse> {
        this.setStatus(200);

        const parsedSourceTypes = sourceTypes
            ? (sourceTypes
                  .split(',')
                  .filter((s) =>
                      Object.values(ValidationSourceType).includes(
                          s as ValidationSourceType,
                      ),
                  ) as ValidationSourceType[])
            : undefined;

        const parsedErrorTypes = errorTypes
            ? (errorTypes
                  .split(',')
                  .filter((s) =>
                      Object.values(ValidationErrorType).includes(
                          s as ValidationErrorType,
                      ),
                  ) as ValidationErrorType[])
            : undefined;

        return {
            status: 'ok',
            results: await this.services.getValidationService().getPaginated(
                req.user!,
                projectUuid,
                { page, pageSize },
                {
                    searchQuery,
                    sortBy,
                    sortDirection,
                    sourceTypes: parsedSourceTypes,
                    errorTypes: parsedErrorTypes,
                    includeChartConfigWarnings,
                    fromSettings,
                },
            ),
        };
    }
}
