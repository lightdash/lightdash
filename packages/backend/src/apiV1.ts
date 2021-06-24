import express from 'express'
import {getAllTables, getStatus, getTable, refreshAllTables, runQuery} from "./lightdash";
import {MetricQuery} from "common";
import {buildQuery} from "./queryBuilder";

export const apiV1Router = express.Router()

apiV1Router.get('/tables', async (req, res, next) => {
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

apiV1Router.get('/tables/:tableId', async (req, res, next) => {
    getTable(req.params.tableId)
        .then(table => {
            res.json({
                status: 'ok',
                results: table,
            })
        })
        .catch(next)
})

apiV1Router.post('/tables/:tableId/compileQuery', async (req, res, next) => {
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

apiV1Router.post('/tables/:tableId/runQuery', async (req, res, next) => {
    const body : MetricQuery = req.body
    runQuery(req.params.tableId, {
        dimensions: body.dimensions,
        metrics: body.metrics,
        filters: body.filters,
        sorts: body.sorts,
        limit: body.limit,
    })
        .then(results => {
            res.json({
                status: 'ok',
                results,
            })
        })
        .catch(next)
})

apiV1Router.post('/refresh', async (req, res) => {
    refreshAllTables()
        .catch(e => console.log(`Error running refresh: ${e}`))
    res.json({
        status: 'ok',
    })
})

apiV1Router.get('/status', async (req, res, next) => {
    getStatus()
        .then(status => {
            res.json({
                status: 'ok',
                results: status,
            })
        })
        .catch(next)
})
