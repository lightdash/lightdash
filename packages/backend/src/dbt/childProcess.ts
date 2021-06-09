import {ChildProcess} from "child_process";
import execa from "execa";

export const spawnDbt = process.env.LIGHTDASH_SPAWN_DBT === undefined ? true : process.env.LIGHTDASH_SPAWN_DBT === 'true'
export const dbtHost = process.env.LIGHTDASH_DBT_HOST || '0.0.0.0'
export const dbtPort = process.env.LIGHTDASH_DBT_PORT || '8580'
const dbtProfilesDir = process.env.DBT_PROFILES_DIR
const dbtProjectDir = process.env.DBT_PROJECT_DIR

let dbtChildProcess: undefined | ChildProcess = undefined
let processRunning: boolean = false

const startDbt = () => {
    if (spawnDbt) {
        if (!dbtProjectDir)
            throw Error('Must specify DBT_PROJECT_DIR')
        if (!dbtProfilesDir)
            throw Error('Must specify DBT_PROFILES_DIR')
        dbtChildProcess = execa(
            'dbt',
            ['rpc', '--host', dbtHost, '--port', dbtPort, '--profiles-dir', dbtProfilesDir],
            {
                cwd: dbtProjectDir,
                stdio: ['pipe', 'pipe', process.stderr]
            }
        )
        dbtChildProcess.on('spawn', () => {
            console.log('Lightdash started a dbt subprocess')
            processRunning = true
        })
        dbtChildProcess.on('exit', (exitCode, killSignal) => {
            processRunning = false
            if (exitCode !== 2) {
                console.log('The dbt subprocess exited unexpectedly. Lightdash is restarting it')
                startDbt()
            }
            console.log('The dbt subprocess exited')
        })
        if (dbtChildProcess.stdout)
            dbtChildProcess.stdout.on('data', (data) => {
                try {
                    const message = data.toString('utf8')
                    const payload = JSON.parse(message)
                    console.log(payload)
                }
                catch (e) {
                }
            })
    }
}

export const refreshDbtChildProcess = async () => {
    if (processRunning) {
        dbtChildProcess && dbtChildProcess.kill(1) // send SIGHUP
    }
    else
        startDbt()
}

export const isDbtProcessRunning = () => processRunning