import execa from "execa";
import {ChildProcess} from "child_process";

export class DbtChildProcess {
    static host: string = 'localhost';
    port: number;
    dbtChildProcess: undefined | ChildProcess;
    processRunning: boolean;
    projectDir: string;
    profilesDir: string;

    constructor(projectDir: string, profilesDir: string, port: number) {
        this.port = port
        this.processRunning = false;
        this.projectDir = projectDir;
        this.profilesDir = profilesDir;
    }

    private _start () {
        this.dbtChildProcess = execa(
            'dbt',
            ['rpc', '--host', DbtChildProcess.host, '--port', `${this.port}`, '--profiles-dir', this.profilesDir],
            {
                cwd: this.projectDir,
                stdio: ['pipe', 'pipe', process.stderr]
            }
        );

        this.dbtChildProcess.on('spawn', () => {
            console.log('Lightdash started a dbt subprocess');
            this.processRunning = true;
        });

        this.dbtChildProcess.on('exit', (exitCode, killSignal) => {
            this.processRunning = false;
            if (exitCode !== 2) {
                console.log('The dbt subprocess exited unexpectedly. Lightdash is restarting it');
                this._start();
            }
            console.log('The dbt subprocess exited');
        });

        if (this.dbtChildProcess.stdout) {
            this.dbtChildProcess.stdout.on('data', (data) => {
                try {
                    const message = data.toString('utf8');
                    const payload = JSON.parse(message);
                    console.log(payload);
                }
                catch (e) {
                    console.log('Cannot parse message from dbt');
                }
            })
        }
    }

    public refresh () {
        if (this.processRunning) {
            this.dbtChildProcess && this.dbtChildProcess.kill(1) // send SIGHUP
        }
        else
            this._start()
    }

}