import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { DbtCatalog, DbtNode } from 'common';
import { DbtError, NetworkError, QueryError } from '../errors';

export class DbtRpcClient {
    serverUrl: string;

    dbtUnreachableErrorMessage: string;

    constructor(serverUrl: string) {
        this.serverUrl = serverUrl;
        this.dbtUnreachableErrorMessage = `Cannot connect to dbt rpc server at ${serverUrl}. Are you sure the process is running correctly?`;
    }

    private async _postDbtSyncRpc(method: string, params: Object) {
        const requestId = uuidv4();
        const payload = {
            method,
            params,
            jsonrpc: '2.0',
            id: requestId,
        };
        const headers = {
            'Content-Type': 'application-json',
        };
        let data: any = {};
        try {
            const response = await fetch(this.serverUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });
            data = await response.json();
        } catch (e) {
            throw new NetworkError(this.dbtUnreachableErrorMessage, {});
        }
        if (data === undefined)
            throw new NetworkError(this.dbtUnreachableErrorMessage, {});
        else if (data.error)
            throw new DbtError(
                `Error returned from dbt while executing method '${method}': ${
                    data.error.data.message || data.error.data
                }`,
                data.error.data,
            );
        else if (data.result?.error)
            throw new DbtError(
                `Error returned from dbt while executing method '${method}'`,
                data.result.error,
            );
        else if (
            data.result?.logs?.some(
                (log: any) => log.message === 'Please log into GCP to continue',
            )
        ) {
            throw new DbtError(
                `Lightdash cannot connect to dbt because of missing GCP credentials. This error happened because your profiles.yml contains a bigquery profile with method: oauth`,
                {},
            );
        }
        return data;
    }

    private async _postDbtAsyncRpc(method: string, params: object) {
        const response = await this._postDbtSyncRpc(method, params);
        const requestToken = response.result.request_token;
        return this._pollDbtServer(requestToken);
    }

    private async _waitForDbtServerReady(): Promise<boolean> {
        let attemptCount = 0;
        const maxAttemptCount = 25;
        const intervalFactor = 1.5;
        const maxInterval = 30000;
        const startInterval = 100;
        const poll =
            (interval: number) =>
            async (
                resolve: (value: boolean) => void,
                reject: (reason: any) => void,
            ): Promise<any> => {
                attemptCount += 1;
                const nextInterval =
                    interval * intervalFactor > maxInterval
                        ? maxInterval
                        : interval * 1.5;
                const tryAgain = () => {
                    setTimeout(
                        poll(nextInterval),
                        nextInterval,
                        resolve,
                        reject,
                    );
                };
                if (attemptCount >= maxAttemptCount)
                    reject(
                        new NetworkError(
                            `Lightdash timedout trying to connect to dbt. Is dbt running correctly?`,
                            {},
                        ),
                    );
                try {
                    const response = await this._postDbtSyncRpc('status', {});
                    const status = response.result.state;
                    if (status === 'ready') resolve(true);
                    if (status === 'compiling') tryAgain();
                    else if (status === 'error') reject(response.result.error);
                    else
                        reject(
                            `Unknown status code received from dbt: ${JSON.stringify(
                                response,
                            )}`,
                        );
                } catch (e) {
                    if (e instanceof NetworkError) tryAgain();
                    else reject(e);
                }
            };
        return new Promise(poll(startInterval));
    }

    private async _pollDbtServer(requestToken: string): Promise<any> {
        let attemptCount = 0;
        const maxAttempts = 50;
        const interval = 1000; // 1 second
        const params = {
            request_token: requestToken,
        };

        const poll = async (
            resolve: (value: any) => void,
            reject: (reason: any) => void,
        ): Promise<any> => {
            attemptCount += 1;
            try {
                const response = await this._postDbtSyncRpc('poll', params);
                if (response.result.state === 'success') {
                    resolve(response.result);
                }
                if (attemptCount === maxAttempts) {
                    reject(
                        new NetworkError(
                            `Lightdash timedout trying to connect to dbt. Is dbt running correctly?`,
                            {},
                        ),
                    );
                } else {
                    setTimeout(poll, interval, resolve, reject);
                }
            } catch (e) {
                reject(e);
            }
        };
        return new Promise(poll);
    }

    public async getDbtCatalog(): Promise<DbtCatalog> {
        const params = {
            compile: false,
        };
        await this._waitForDbtServerReady();
        return this._postDbtAsyncRpc('docs.generate', params);
    }

    public async getDbtManifest(): Promise<{ results: { node: DbtNode }[] }> {
        await this._waitForDbtServerReady();
        const manifest = await this._postDbtAsyncRpc('compile', {});
        return manifest;
    }

    public async runQuery(query: string): Promise<Record<string, any>[]> {
        const params = {
            name: 'lightdash query',
            timeout: 60,
            sql: Buffer.from(query).toString('base64'),
        };
        try {
            await this._waitForDbtServerReady();
            const response = await this._postDbtAsyncRpc('run_sql', params);
            const columns: string[] = response.results[0].table.column_names;
            // eslint-disable-next-line prefer-destructuring
            const rows: any[][] = response.results[0].table.rows;
            return rows.map((row) =>
                Object.fromEntries(
                    row.map((value: any, index: number) => [
                        columns[index],
                        value,
                    ]),
                ),
            );
        } catch (e) {
            if (e instanceof DbtError) {
                const errorData = {
                    databaseResponse: (e.data?.message || '')
                        .split('\n')
                        .map((s: string) => s.trim())
                        .slice(1)
                        .join('\n'),
                };
                throw new QueryError('Error running on Dbt adapter', errorData);
            }
            throw e;
        }
    }
}
