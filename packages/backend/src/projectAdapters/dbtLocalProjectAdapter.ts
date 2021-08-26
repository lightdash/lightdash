import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtChildProcess } from '../dbt/dbtChildProcess';
import { NetworkError } from '../errors';
import { DbtRpcClient } from '../dbt/dbtRpcClient';

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    dbtChildProcess: DbtChildProcess;

    rpcClient: DbtRpcClient;

    constructor(
        projectDir: string,
        profilesDir: string,
        port: number,
        target: string | undefined,
    ) {
        const dbtChildProcess = new DbtChildProcess(
            projectDir,
            profilesDir,
            port,
            target,
        );
        super();
        const serverUrl = `http://${DbtChildProcess.host}:${dbtChildProcess.port}/jsonrpc`;
        this.rpcClient = new DbtRpcClient(serverUrl);
        this.dbtChildProcess = dbtChildProcess;
    }

    private _handleError(e: Error): Error {
        if (e instanceof NetworkError) {
            // extend error with latest dbt error messages
            return new NetworkError(
                `${
                    e.message
                }\nThis could be due to the following dbt errors:\n${this.dbtChildProcess.latestErrorMessage()}`,
                e.data,
            );
        }
        return e;
    }

    public async compileAllExplores() {
        // Always refresh dbt server to reload dbt project files into memory
        // this will also start up the dbt server if it previously crashed.
        await this.dbtChildProcess.restart();
        try {
            return await super.compileAllExplores(true);
        } catch (e) {
            throw this._handleError(e);
        }
    }

    public async runQuery(sql: string): Promise<Record<string, any>[]> {
        try {
            return await super.runQuery(sql);
        } catch (e) {
            throw this._handleError(e);
        }
    }
}
