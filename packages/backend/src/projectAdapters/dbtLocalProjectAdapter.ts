import {DbtBaseProjectAdapter} from "./dbtBaseProjectAdapter";
import {DbtChildProcess} from "../dbt/dbtChildProcess";

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    dbtChildProcess: DbtChildProcess;

    constructor(projectDir: string, profilesDir: string, port: number) {
        const dbtChildProcess = new DbtChildProcess(projectDir, profilesDir, port);
        super(`http://${DbtChildProcess.host}:${dbtChildProcess.port}/jsonrpc`);
        this.dbtChildProcess = dbtChildProcess;
    }

    public async compileAllExplores() {
        // Always refresh dbt server to re-parse dbt project directory
        // this will also start up the dbt server if it's already
        // in a crash state
        this.dbtChildProcess.refresh()
        return super.compileAllExplores()
    }


}