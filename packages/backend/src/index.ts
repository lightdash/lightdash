import express, {NextFunction, Request, Response} from "express";
import path from "path";
import {runQueryOnDbtAdapter} from "./dbt";
import {errorHandler}from "./errors";
import {MetricQuery} from "common";
import morgan from 'morgan'
import {getAllTables, getStatus, getTable, refreshAllTables} from "./lightdash";
import {buildQuery} from "./queryBuilder";

const app = express();
app.use(express.json())
app.use(morgan('dev'))
app.use(express.static(path.join(__dirname, '../../frontend/build')))

app.get('/tables', async (req, res, next) => {
    getAllTables()
        .then(tables => res.json({
            status: 'ok',
            results: tables.map(table => ({
                name: table.tables[table.baseTable].name,
                description: table.tables[table.baseTable].description,
                sql: table.tables[table.baseTable].sqlTable,
            }))
        }))
        .catch(next)
})

app.get('/tables/:tableId', async (req, res, next) => {
    getTable(req.params.tableId)
        .then(table => {
            res.json({
                status: 'ok',
                results: table,
            })
        })
        .catch(next)
})

app.post('/tables/:tableId/compileQuery', async (req, res, next) => {
    const body : MetricQuery = req.body
    getTable(req.params.tableId)
        .then(table => buildQuery({
            explore: table,
            metricQuery: {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
            },
        }))
        .then(sql => {
            res.json({
                status: 'ok',
                results: sql,
            })
        })
        .catch(next)
})

app.post('/tables/:tableId/runQuery', async (req, res, next) => {
    const body : MetricQuery = req.body
    getTable(req.params.tableId)
        .then(table => buildQuery({
            explore: table,
            metricQuery: {
                dimensions: body.dimensions,
                metrics: body.metrics,
                filters: body.filters,
                sorts: body.sorts,
                limit: body.limit,
            },
        }))
        .then(runQueryOnDbtAdapter)
        .then(results => {
            res.json({
                status: 'ok',
                results,
            })
        })
        .catch(next)
})

app.post('/refresh', async (req, res) => {
    refreshAllTables()
    res.json({
        status: 'ok',
    })
})

app.get('/status', async (req, res, next) => {
    try {
        const status = getStatus()
        res.json({
            status: 'ok',
            results: status,
        })
    }
    catch (e) {
        next(e)
    }
})

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build', 'index.html'))
})

app.use(async (error: Error, req: Request, res: Response, next: NextFunction) => {
    await errorHandler(error, res)
})

const port = process.env.PORT || 8080
app.listen(port, () => {
    console.log(`   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch lightdash at http://localhost:8080\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`)
})
