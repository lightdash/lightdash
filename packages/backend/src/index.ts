import express from "express";
import path from "path";
import NodeCache from "node-cache";
import {getExploresFromDbt, runQueryOnDbtAdapter, waitForDbtServerReady} from "./dbt";
import execa from "execa";
import {ChildProcess} from 'child_process';

const app = express();
app.use(express.json())

if (!process.env.DBT_PROJECT_PATH) {
    throw Error('Must specify DBT_PROJECT_PATH')
}

let dbtChildProcess: undefined | ChildProcess = undefined
const runDbt = () => execa('dbt', ['rpc'], {cwd: process.env.DBT_PROJECT_PATH})
const respawnDbt = (childProcess: ChildProcess) => {
    dbtChildProcess = childProcess
    if (childProcess.stdout)
        childProcess.stdout.pipe(process.stdout)
    childProcess.on('exit', () => {
        respawnDbt(runDbt())
    })
}
const refreshDbt = async () => {
    dbtChildProcess && dbtChildProcess.kill(1) // send SIGHUP
}

respawnDbt(runDbt())
const cache = new NodeCache()
app.use(express.static(path.join(__dirname, '../../frontend/build')))

app.get('/explores', (req, res) => {
    const getAndCache = async () => {
        await refreshDbt()
        await waitForDbtServerReady()
        const explores = await getExploresFromDbt()
        cache.set('explores', explores, 3600)  // Clear cache in an hour
        return explores
    }
    const fetchExplores = async () => {
        console.log(req.query)
        if (req.query.refresh) {
            return getAndCache()
        }
        return cache.get('explores') || getAndCache()
    }

    fetchExplores()
        .then(explores => res.json(explores))
})

app.post('/query', (req, res) => {
    const body: { query: string } = req.body;
    runQueryOnDbtAdapter(body.query)
        .then((results: { [columnName: string]: any }[]) => res.json(results))
})

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'))
})

app.listen(process.env.PORT || 8080);
