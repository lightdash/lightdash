import {
    DbtError,
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    isDbtRpcDocsGenerateResults,
    isDbtRpcManifestResults,
    isDbtRpcRunSqlResults,
    NetworkError,
    NoServerRunningError,
    RetryableNetworkError,
} from '@lightdash/common';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { DbtClient } from '../types';

export const DEFAULT_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
};

type PollArgs<T> = {
    func: () => Promise<T>;
    condition: (t: T) => Promise<boolean>;
    maxAttempts: number;
    startInterval: number;
    maxInterval: number;
    intervalMultiplier: number;
};

const pollOverNetwork = async <T>({
    func,
    condition,
    maxAttempts,
    startInterval,
    maxInterval,
    intervalMultiplier,
}: PollArgs<T>): Promise<T> => {
    let attempts = 0;
    let interval = startInterval;

    const poll = async (
        resolve: (res: T) => void,
        reject: (err: any) => void,
    ) => {
        if (attempts >= maxAttempts) {
            reject(
                new NetworkError(
                    `Lightdash timedout trying to reach dbt server.`,
                    {},
                ),
            );
            return;
        }
        try {
            const result = await func();
            const success = await condition(result);
            if (success) {
                resolve(result);
                return;
            }
        } catch (e: any) {
            if (!(e instanceof RetryableNetworkError)) {
                reject(e);
                return;
            }
        }
        attempts += 1;
        interval = Math.min(maxInterval, interval * intervalMultiplier);
        setTimeout(poll, interval, resolve, reject);
    };
    return new Promise<T>(poll);
};

export class DbtRpcClientBase implements DbtClient {
    serverUrl: string;

    headers: Record<string, any>;

    constructor(
        serverUrl: string,
        headers: Record<string, any> = DEFAULT_HEADERS,
    ) {
        this.serverUrl = serverUrl;
        this.headers = headers;
    }

    async _post(method: string, params: Object): Promise<Record<string, any>> {
        const requestId = uuidv4();
        const payload = {
            method,
            params,
            jsonrpc: '2.0',
            id: requestId,
        };
        let data: any = {};
        const url = `${this.serverUrl}/?method=${method}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(payload),
            });
            data = await response.json();
        } catch (e: any) {
            // Network errors or not a json response - server not available or not ready
            throw new RetryableNetworkError(`Network error: ${e}, try again.`);
        }
        if (data === undefined) {
            // Server responded with an empty message - unexpected behaviour
            throw new NetworkError(
                'Unexpected error, dbt returned an empty response',
                {},
            );
        } else if (data.jsonrpc === '2.0') {
            if (data.error) {
                // Dbt method returned an error
                const messages = [];
                if (data.error.message) {
                    messages.push(data.error.message);
                }
                if (data.error.data?.message) {
                    messages.push(data.error.data.message);
                }
                const combinedMessage = messages.join('\n');
                throw new DbtError(combinedMessage, data.error);
            } else if (
                data.result &&
                typeof data.result === 'object' &&
                data.result !== null
            ) {
                return data.result;
            } else {
                throw new NetworkError(
                    'Unexpected error, dbt returned a response with no results',
                    data,
                );
            }
        }
        // We have a json response but not a valid rpc server response
        throw new NetworkError('Unexpected response from dbt rpc server', data);
    }

    private async _isServerResponding(): Promise<boolean> {
        const result = await this._post('status', {});
        switch (result?.state) {
            case 'ready':
            case 'error':
            case null:
                return true;
            case 'compiling':
                return false;
            default:
                throw new NetworkError(
                    'Unexpected result from dbt status',
                    result,
                );
        }
    }

    async _isServerReady(): Promise<boolean> {
        const result = await this._post('status', {});
        switch (result?.state) {
            case 'ready':
                return true;
            case 'compiling':
                return false;
            case 'error':
            case null:
                if (result?.error?.message === undefined) {
                    throw new NetworkError(
                        'Unexpected error format received from dbt while checking server status',
                        result,
                    );
                }
                throw new DbtError(
                    `Dbt Error: ${result.error.message}`,
                    result,
                );
            default:
                throw new NetworkError(
                    'Unexpected result from dbt status',
                    result,
                );
        }
    }

    private async _waitForServerReady(): Promise<true> {
        await pollOverNetwork({
            func: () => this._isServerReady(),
            condition: async (x) => x,
            startInterval: 200,
            maxInterval: 1000,
            intervalMultiplier: 1.5,
            maxAttempts: 25,
        });
        return true;
    }

    private async _waitForServerResponding(): Promise<true> {
        await pollOverNetwork({
            func: () => this._isServerResponding(),
            condition: async (x) => x,
            startInterval: 200,
            maxInterval: 1000,
            intervalMultiplier: 1.5,
            maxAttempts: 25,
        });
        return true;
    }

    private async _submitJob(
        method: string,
        params: Record<string, any>,
    ): Promise<string> {
        const results = await this._post(method, params);
        if (results.request_token) {
            return `${results.request_token}`;
        }

        if (results?.error?.message) {
            if (
                results.error.message ===
                'No server running! Please restart the server.'
            ) {
                throw new NoServerRunningError(
                    'No server running! Please restart the server. If you are using dbt cloud make sure you have the IDE for your project open.',
                );
            }
            throw new DbtError(`Dbt Error: ${results.error.message}`, results);
        }

        throw new NetworkError(
            'Unexpected result from dbt while trying to submit new job',
            results,
        );
    }

    private async _jobStatus(requestToken: string) {
        const result = await this._post('poll', {
            request_token: requestToken,
        });
        return result;
    }

    private async _waitForJobComplete(
        requestToken: string,
    ): Promise<Record<string, any>> {
        const isJobComplete = async (
            results: Record<string, any>,
        ): Promise<boolean> => {
            switch (results.state) {
                case 'running':
                    return false;
                case 'success':
                    return true;
                default:
                    throw new NetworkError(
                        'Unexpected response received from dbt',
                        results,
                    );
            }
        };
        const jobResults = await pollOverNetwork<Record<string, any>>({
            func: () => this._jobStatus(requestToken),
            condition: isJobComplete,
            maxAttempts: 20,
            startInterval: 500,
            intervalMultiplier: 1.5,
            maxInterval: 30000,
        });
        return jobResults;
    }

    public async getDbtCatalog(): Promise<DbtRpcDocsGenerateResults> {
        await this._waitForServerReady();
        const requestToken = await this._submitJob('docs.generate', {
            compile: false,
        });
        const jobResults = await this._waitForJobComplete(requestToken);
        if (isDbtRpcDocsGenerateResults(jobResults)) {
            return jobResults;
        }
        throw new NetworkError(
            'Unknown response received from dbt when generating docs',
            jobResults,
        );
    }

    public async installDeps(): Promise<void> {
        await this._waitForServerResponding();
        const requestToken = await this._submitJob('deps', {});
        await this._waitForJobComplete(requestToken);
    }

    public async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        await this._waitForServerReady();
        const requestToken = await this._submitJob('get-manifest', {});
        const jobResults = await this._waitForJobComplete(requestToken);
        if (isDbtRpcManifestResults(jobResults)) {
            return jobResults;
        }
        throw new NetworkError(
            'Unknown response received from dbt when compiling',
            jobResults,
        );
    }

    public async runQuery(query: string): Promise<Record<string, any>[]> {
        const params = {
            name: 'request',
            timeout: 60,
            sql: Buffer.from(query).toString('base64'),
        };
        await this._waitForServerReady();
        const requestToken = await this._submitJob('run_sql', params);
        const results = await this._waitForJobComplete(requestToken);
        if (isDbtRpcRunSqlResults(results)) {
            const { column_names: columns, rows } = results.results[0].table;
            return rows.map((row) =>
                Object.fromEntries(
                    row.map((value: any, index: number) => [
                        columns[index],
                        value,
                    ]),
                ),
            );
        }
        throw new NetworkError(
            'Unknown response received from dbt while running query',
            results,
        );
    }

    async test(): Promise<void> {
        await this.installDeps();
        await this.runQuery('SELECT 1');
    }
}
