import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtChildProcess } from '../dbt/dbtChildProcess';
import { NetworkError } from '../errors';

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    dbtChildProcess: DbtChildProcess;

    constructor(projectDir: string, profilesDir: string, port: number) {
        const dbtChildProcess = new DbtChildProcess(
            projectDir,
            profilesDir,
            port,
        );
        super(`http://${DbtChildProcess.host}:${dbtChildProcess.port}/jsonrpc`);
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
