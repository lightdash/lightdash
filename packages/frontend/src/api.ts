import {ApiError, ApiExploresResults, ApiQueryResults} from "common";

const headers = {
    'Content-Type': 'application/json'
}

const handleErrors = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name)
        return err
    return {
        status: 'error',
        error: {
            name: 'ServerError',
            statusCode: 500,
            message: `Unexpected error from backend ${err}`,
            data: {}
        }
    }
}

export const getExplores = async (refresh: boolean): Promise<ApiExploresResults> => {
    const url = refresh ? '/explores?refresh=true' : '/explores'
    return fetch(url, {method: 'GET', headers})
        .then(r => {
            if (!r.ok)
                return r.json().then(d => { throw d })
            return r
        })
        .then(r => r.json())
        .catch(handleErrors)
}

export const runQuery = async (query: string): Promise<ApiQueryResults> => {
    const url = '/query'
    const body = JSON.stringify({ query })
    return fetch(url, { method: 'POST', headers, body })
        .then(r => {
            if (!r.ok)
                return r.json().then(d => { throw d })
            return r
        })
        .then(r => r.json())
        .catch(handleErrors)
}