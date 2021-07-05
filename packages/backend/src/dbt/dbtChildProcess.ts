import execa from 'execa';
import { ChildProcess } from 'child_process';
import { DbtError } from '../errors';

export class DbtChildProcess {
    static host: string = 'localhost';

    port: number;

    dbtChildProcess: undefined | ChildProcess;

    projectDir: string;

    profilesDir: string;

    errorLogs: string[];

    constructor(projectDir: string, profilesDir: string, port: number) {
        this.port = port;
        this.projectDir = projectDir;
        this.profilesDir = profilesDir;
        this.errorLogs = [];
    }

    private _storeErrorMessage(payload: {
        message?: string;
        levelname?: string;
    }) {
        if (
            payload.message &&
            (payload.levelname === 'ERROR' || payload.levelname === 'WARNING')
        ) {
            this.errorLogs = [payload.message, ...this.errorLogs.slice(0, 5)];
        }
    }

    private static _logMessageShowsServerReady(payload: {
        message?: string;
    }): boolean {
        return !!payload.message?.startsWith('Send requests to ');
    }

    public isProcessLive(): boolean {
        return this.dbtChildProcess !== undefined;
    }

    public latestErrorMessage(): string {
        return `Dbt server exited with an error:\n${this.errorLogs.join('\n')}`;
    }

    private async _start(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.errorLogs = [];
            this.dbtChildProcess = execa(
                'dbt',
                [
                    'rpc',
                    '--host',
                    DbtChildProcess.host,
                    '--port',
                    `${this.port}`,
                    '--profiles-dir',
                    this.profilesDir,
                ],
                {
                    cwd: this.projectDir,
                    stdio: ['pipe', 'pipe', process.stderr],
                },
            );

            // reject or resolve depends on whether process emits success logs or exits first
            // process can still exit later after promise resolves true
            this.dbtChildProcess.on('exit', () => {
                this.dbtChildProcess = undefined;
                console.log(`dbt exited`);
                reject(new DbtError(this.latestErrorMessage(), {}));
            });

            this.dbtChildProcess.stdout?.on('data', (data) => {
                try {
                    const messages: string[] = data.toString().split(/\r?\n/);
                    const nonEmptyMessages = messages.filter((s) => s !== '');

                    const isServerReady = nonEmptyMessages.reduce(
                        (isReady, message) => {
                            const payload = JSON.parse(message || '{}');
                            this._storeErrorMessage(payload);
                            return DbtChildProcess._logMessageShowsServerReady(
                                payload,
                            );
                        },
                        false,
                    );

                    if (isServerReady) {
                        resolve();
                    }
                } catch (e) {
                    // Note: assume any log that isn't json parse-able from dbt is an error
                    console.log('Cannot parse message from dbt:', e.message);
                    console.log(data.toString());
                    reject(
                        new DbtError('Cannot parse message from dbt:', {
                            error: e,
                            event: data.toString(),
                        }),
                    );
                }
            });
        });
    }

    public async restart() {
        this.dbtChildProcess?.kill(2); // .kill(2) sends SIGINT - kills dbt process without auto-restart
        await this._start();
    }
}
