import {DbtError, NetworkError, QueryError} from "../errors";
import {v4 as uuidv4} from "uuid";
import fetch from "node-fetch";
import {isDbtProcessRunning, spawnDbt, dbtHost, dbtPort} from "./childProcess";

const DBT_RPC_URL = `http://${dbtHost}:${dbtPort}/jsonrpc`

const dbtUnreachableErrorMessage =
    spawnDbt ?
        `Cannot connect to dbt: Please check your dbt profile and project location.`
        : `Cannot connect to dbt, expected a running dbt process at ${DBT_RPC_URL}. Please check host and port configuration and ensure that dbt started correctly.`
const postDbtSyncRpc = async (method: string, params: Object) => {
    const requestId = uuidv4()
    const payload = {
        method,
        params,
        jsonrpc: '2.0',
        id: requestId,
    }
    const headers = {
        'Content-Type': 'application-json',
    }
    let data: any = {}
    try {
        const response = await fetch(DBT_RPC_URL, {method: 'POST', headers: headers, body: JSON.stringify(payload)})
        data = await response.json()
    } catch (e) {
        throw new NetworkError(dbtUnreachableErrorMessage, {})
    }
    if (data === undefined)
        throw new NetworkError(dbtUnreachableErrorMessage, {})
    else if (data.error)
        throw new DbtError(`Error returned from dbt while executing method '${method}': ${data.error.data.message || data.error.data}`, data.error.data)
    else if (data.result?.error)
        throw new DbtError(`Error returned from dbt while executing method '${method}'`, data.result.error)
    return data
}
export const postDbtAsyncRpc = async (method: string, params: object) => {
    const response = await postDbtSyncRpc(method, params)
    const requestToken = response.result.request_token
    return await pollDbtServer(requestToken)
}
export const runQueryOnDbtAdapter = async (query: string): Promise<{ [col: string]: any }> => {
    const params = {
        name: 'lightdash query',
        timeout: 60,
        sql: Buffer.from(query).toString('base64'),
    }
    try {
        const response = await postDbtAsyncRpc('run_sql', params)
        const columns: string[] = response.results[0].table.column_names
        const rows: any[][] = response.results[0].table.rows
        return rows.map(row => Object.fromEntries(row.map((value: any, index: number) => ([columns[index], value]))))
    } catch (e) {
        if ((e instanceof DbtError)) {
            const errorData = {
                databaseResponse: (e.data?.message || '').split('\n').map((s: string) => s.trim()).slice(1).join('\n')
            }
            throw new QueryError('Error running on Dbt adapter', errorData)
        }
        throw e
    }
}
export const waitForDbtServerReady = async (): Promise<boolean> => {
    let attemptCount = 0
    const maxAttemptCount = 25
    const intervalFactor = 1.5
    const maxInterval = 30000
    const startInterval = 100
    const poll = (interval: number) => (
        async (resolve: (value: boolean) => void, reject: (reason: any) => void): Promise<any> => {
            attemptCount++
            const nextInterval = (interval * intervalFactor > maxInterval) ? maxInterval : interval * 1.5
            const tryAgain = () => {
                setTimeout(poll(nextInterval), nextInterval, resolve, reject)
            }
            if (attemptCount >= maxAttemptCount)
                reject(new NetworkError(`Lightdash timedout trying to connect to dbt. Is dbt running correctly?`, {}))
            if (spawnDbt && !isDbtProcessRunning())
                reject(new NetworkError(dbtUnreachableErrorMessage, {}))
            try {
                const response = await postDbtSyncRpc('status', {})
                const status = response.result.state
                if (status === 'ready')
                    return resolve(true)
                else if (status === 'compiling')
                    tryAgain()
                else if (status === 'error')
                    reject(response.result.error)
                else
                    reject(`Unknown status code received from dbt: ${JSON.stringify(response)}`)
            } catch (e) {
                if (e instanceof NetworkError)
                    tryAgain()
                else
                    reject(e)
            }
        }
    )
    return new Promise(poll(startInterval))
}
const pollDbtServer = async (requestToken: string): Promise<any> => {
    let attemptCount = 0
    const maxAttempts = 50
    const interval = 1000  // 1 second
    const params = {
        request_token: requestToken
    }

    const poll = async (resolve: (value: any) => void, reject: (reason: any) => void): Promise<any> => {
        attemptCount++
        try {
            const response = await postDbtSyncRpc('poll', params)
            if (response.result.state === 'success') {
                return resolve(response.result)
            } else if (attemptCount === maxAttempts) {
                reject(new NetworkError(`Lightdash timedout trying to connect to dbt. Is dbt running correctly?`, {}))
            } else {
                setTimeout(poll, interval, resolve, reject)
            }
        } catch (e) {
            reject(e)
        }

    }
    return new Promise(poll)
}