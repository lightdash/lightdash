import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiWarehouseCatalog,
    SqlRunnerBody,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import fs from 'fs';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/sqlRunner')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SQL runner')
export class SqlRunnerController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/tables')
    @OperationId('getTables')
    async getTables(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseCatalog> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseTables(req.user!, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/tables/{tableName}')
    @OperationId('getTableFields')
    async getTableFields(
        @Path() projectUuid: string,
        @Path() tableName: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseCatalog> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getWarehouseFields(req.user!, projectUuid, tableName),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/run')
    @OperationId('runSql')
    async runSql(
        @Path() projectUuid: string,
        @Body() body: SqlRunnerBody,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .scheduleSqlJob(req.user!, projectUuid, body.sql),
        };
    }

    /**
     * Get results from a file stored locally
     * @param fileId the fileId for the file
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('results/{fileId}')
    @OperationId('getLocalResults')
    async getLocalResults(
        @Path() fileId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<any> {
        this.setStatus(200);
        this.setHeader('Content-Type', 'application/json');

        const resultsFilePath = await this.services
            .getProjectService()
            .getResultsFile(req.user!, projectUuid, fileId);

        // TODO set response headers
        /*
 //https://github.com/lukeautry/tsoa/issues/800
       const stat: fs.Stats = await fs.promises.stat(filePath);

      this.setStatus(200);
      this.setHeader('Content-Type', mime.lookup(filePath));
      this.setHeader('Content-Length', stat.size.toString());
      // Removing this line will cause to not launch the download, just serve the file as it
      this.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      */
        const mystream = fs.createReadStream(resultsFilePath);
        const { res } = req;
        if (res) {
            mystream.pipe(res);
            await new Promise<void>((resolve, reject) => {
                mystream.on('end', () => {
                    res.end();
                    resolve();
                });
            });
        }
    }
}
