import express from "express";
import path from "path";
import NodeCache from "node-cache";
import {getExploresFromDbt, runQueryOnDbtAdapter} from "./dbt";
import execa from "execa";
import { ChildProcess }from 'child_process';

const app = express();
app.use(express.json())

if (!process.env.DBT_PROJECT_PATH) {
  throw Error('Must specify DBT_PROJECT_PATH')
}

const runDbt = () => execa('dbt', ['rpc'], {cwd: process.env.DBT_PROJECT_PATH})

const respawnDbt = (proc: ChildProcess) => {
  if (proc.stdout) {
    proc.stdout.pipe(process.stdout)
  }
  proc.on('exit', () => {
    respawnDbt(runDbt())
  })
}
respawnDbt(runDbt())

const cache = new NodeCache()

app.use(express.static(path.join(__dirname, '../../frontend/build')))

app.get('/explores', (req, res) => {
  const getAndCache = async () => {
    const explores = await getExploresFromDbt()
    cache.set('explores', explores, 3600)
    return explores
  }
  const fetchExplores = async () => {
    if (req.query.refresh) {
      return getAndCache()
    }
    return cache.get('explores') || getAndCache()
  }

  fetchExplores()
      .then(explores => res.json(explores))
})

app.post('/query', (req, res) => {
  const body: {query: string} = req.body;
  runQueryOnDbtAdapter(body.query)
      .then((results: {[columnName: string]: any}[]) => res.json(results))
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'))
})

app.listen(process.env.PORT || 8080);
