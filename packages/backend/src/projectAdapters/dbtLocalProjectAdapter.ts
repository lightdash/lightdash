import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtChildProcess } from '../dbt/dbtChildProcess';
import { NetworkError } from '../errors';
import { DbtRpcClient } from '../dbt/dbtRpcClient';
import { DbtCliClient } from '../dbt/dbtCliClient';

type DbtLocalProjectAdapterArgs = {
    projectDir: string;
    profilesDir: string;
    port: number;
    target: string | undefined;
    profileName?: string | undefined;
    environment?: Record<string, string>;
};

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    dbtChildProcess: DbtChildProcess;

    constructor({
        projectDir,
        profilesDir,
        port,
        target,
        profileName,
        environment,
    }: DbtLocalProjectAdapterArgs) {
        const childProcess = new DbtChildProcess(
            projectDir,
            profilesDir,
            port,
            target,
            profileName,
            environment,
        );
        const serverUrl = `http://${DbtChildProcess.host}:${childProcess.port}/jsonrpc`;
        const rpcClient = new DbtRpcClient(serverUrl);
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            profileName,
            target,
        });
        super(dbtClient, rpcClient);
        this.dbtChildProcess = childProcess;
    }

    async destroy(): Promise<void> {
        await this.dbtChildProcess.kill();
        await super.destroy();
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

    public async test() {
        // Always refresh dbt server to reload dbt project files into memory
        // this will also start up the dbt server if it previously crashed.
        await this.dbtChildProcess.restart();
        try {
            return await super.test();
        } catch (e) {
            throw this._handleError(e);
        }
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
