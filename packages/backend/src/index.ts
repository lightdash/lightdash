import express, {NextFunction, Request, Response} from "express";
import path from "path";
import NodeCache from "node-cache";
import {
    attachTypesToModels, convertExplores, getDbtCatalog,
    getDbtModels,
    runQueryOnDbtAdapter,
    waitForDbtServerReady
} from "./dbt";
import execa from "execa";
import {ChildProcess} from 'child_process';
import {errorHandler, MissingCatalogEntryError} from "./errors";
import {ApiQueryResults} from "common";
import morgan from 'morgan'

const app = express();
app.use(express.json())
app.use(morgan('dev'))

const spawnDbt = process.env.LIGHTDASH_SPAWN_DBT === undefined ? true : process.env.LIGHTDASH_SPAWN_DBT === 'true'
const dbtHost = process.env.LIGHTDASH_DBT_HOST || '0.0.0.0'
const dbtPort = process.env.LIGHTDASH_DBT_PORT || '8580'
const dbtProfilesDir = process.env.DBT_PROFILES_DIR || '~/.dbt'

if (spawnDbt && !process.env.DBT_PROJECT_DIR) {
    throw Error('Must specify DBT_PROJECT_DIR')
}

let dbtChildProcess: undefined | ChildProcess = undefined
const runDbt = () => execa('dbt', ['rpc', '--host', dbtHost, '--port', dbtPort, '--profiles-dir', dbtProfilesDir], {cwd: process.env.DBT_PROJECT_DIR})
const respawnDbt = (childProcess: ChildProcess) => {
    dbtChildProcess = childProcess
    if (childProcess.stdout)
        childProcess.stdout.pipe(process.stdout)
    if (childProcess.stderr)
        childProcess.stderr.pipe(process.stderr)
    childProcess.on('exit', () => {
        respawnDbt(runDbt())
    })
}
const refreshDbt = async () => {
    dbtChildProcess && dbtChildProcess.kill(1) // send SIGHUP
}

if (spawnDbt) {
    respawnDbt(runDbt())
}

const cache = new NodeCache()
app.use(express.static(path.join(__dirname, '../../frontend/build')))

app.get('/explores', async (req, res, next) => {
    const getAndCache = async () => {
        // Refresh dbt server to re-parse dbt project directory
        // throws NetworkError or ParseError
        await refreshDbt()
        await waitForDbtServerReady()

        // Get the models from dbt - throws ParseError
        const models = await getDbtModels()

        // Be lazy and try to type the models without refreshing the catalog
        try {
            const lazyTypedModels = await attachTypesToModels(models, cache.get('catalog') || {nodes: {}})
            const lazyExplores = await convertExplores(lazyTypedModels)
            await cache.set('explores', lazyExplores, 3600)  // Clear cache in an hour
            return lazyExplores
        }
        catch (e) {
            if (e instanceof MissingCatalogEntryError) {
                // Some types were missing so refresh the catalog
                const catalog = await getDbtCatalog()
                await cache.set('catalog', catalog)
                const typedModels = await attachTypesToModels(models, catalog)
                const explores = await convertExplores(typedModels)
                await cache.set('explores', explores, 3600)  // Clear cache in an hour
                return explores
            }
            throw e
        }
    }
    const fetchExplores = async () => {
        if (req.query.refresh) {
            return await getAndCache()
        }

        return await cache.get('explores') || await getAndCache()
    }

    fetchExplores()
        .then(explores => res.json({ status: 'ok', results: explores }))
        .catch(next)
})

app.post('/query', async (req, res, next) => {
    const body: { query: string } = req.body;
    runQueryOnDbtAdapter(body.query)
        .then(results => res.json({ status: 'ok', results: results } as ApiQueryResults))
        .catch(next)
})

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'))
})

app.use(async (error: Error, req: Request, res: Response, next: NextFunction) => {
    await errorHandler(error, res)
})

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`--------------------------------------\nLaunch lightdash at http://localhost:${port}\n--------------------------------------`));
