import { CreateWarehouseCredentials } from 'common';
import tempy from 'tempy';
import * as path from 'path';
import { writeFileSync } from 'fs';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtChildProcess } from '../dbt/dbtChildProcess';
import { NetworkError } from '../errors';
import { DbtRpcClient } from '../dbt/dbtRpcClient';
import {
    LIGHTDASH_PROFILE_NAME,
    profileFromCredentials,
} from '../dbt/profiles';

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    dbtChildProcess: DbtChildProcess;

    rpcClient: DbtRpcClient;

    profilesDirectory: string;

    projectDirectory: string;

    port: number;

    target: string | undefined;

    profilesFileName: 'profiles.yml' = 'profiles.yml';

    constructor(
        projectDir: string,
        profilesDir: string,
        port: number,
        target: string | undefined,
    ) {
        super();
        this.dbtChildProcess = new DbtChildProcess(
            projectDir,
            profilesDir,
            port,
            target,
        );
        const serverUrl = `http://${DbtChildProcess.host}:${this.dbtChildProcess.port}/jsonrpc`;
        this.profilesDirectory = profilesDir;
        this.projectDirectory = projectDir;
        this.port = port;
        this.rpcClient = new DbtRpcClient(serverUrl);
    }

    async updateProfile(credentials: CreateWarehouseCredentials) {
        this.profilesDirectory = tempy.directory();
        const overrideProfileFilename = path.join(
            this.profilesDirectory,
            'profiles.yml',
        );
        const { profile, environment } = profileFromCredentials(
            credentials,
            this.target,
        );
        writeFileSync(overrideProfileFilename, profile);
        await this.dbtChildProcess.kill();
        this.dbtChildProcess = new DbtChildProcess(
            this.projectDirectory,
            this.profilesDirectory,
            this.port,
            this.target,
            LIGHTDASH_PROFILE_NAME,
            environment,
        );
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
