import { ApiErrorPayload, UnexpectedServerError } from '@lightdash/common';
import { Body, Post } from '@tsoa/runtime';
import express from 'express';
import fetch, { Headers } from 'node-fetch';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from 'tsoa';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

// TODO: get there from lightdash config / env vars
const url: string = '';
const bearerToken: string = '';
const environmentId: string = '';

@Route('/api/v1/projects/{projectUuid}/metricflow')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class MetricFlowController extends Controller {
    /**
     * Get MetricFlow data
     * @param projectUuid the projectId
     * @param req express request
     * @param body graphql query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('GetMetricFlowData')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: { query: string },
    ): Promise<any> {
        const myHeaders = new Headers();
        myHeaders.append('Content-Type', 'application/json');
        myHeaders.append('Authorization', `Bearer ${bearerToken}`);

        const graphql = JSON.stringify({
            query: body.query,
            variables: {
                environmentId,
            },
        });
        const data: { data: any; errors: Array<{ message: string }> } =
            await fetch(url, {
                method: 'POST',
                headers: myHeaders,
                body: graphql,
                redirect: 'follow',
            }).then((response) => response.json());

        if (data.errors) {
            this.setStatus(500);
            return {
                status: 'error',
                error: new UnexpectedServerError(
                    data.errors.map((e) => e.message).join(', '),
                    data.errors,
                ),
            };
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: data.data,
        };
    }
}
