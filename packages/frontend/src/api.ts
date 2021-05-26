import {ApiError, ApiQueryResults, ApiResponse, ApiResults} from "common";

const headers = {
    'Content-Type': 'application/json'
}

const handleError = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name)
        return err
    return {
        status: 'error',
        error: {
            name: 'ServerError',
            statusCode: 500,
            message: `Unexpected error from backend ${err}`,
            data: err
        }
    }
}

type LightdashApiProps = {
    method: 'GET' | 'POST'
    url: string,
    body: BodyInit | null | undefined,
}
export const lightdashApi = async <T extends ApiResults>({ method, url, body }: LightdashApiProps): Promise<T> => {
    return fetch(url, {method, headers, body})
        .then(r => {
            if (!r.ok)
                return r.json().then(d => { throw d })
            return r
        })
        .then(r => r.json())
        .then((d: ApiResponse) => {
            switch (d.status) {
                case "ok": return d.results as T
                case "error": throw d
                default: throw d
            }
        })
        .catch(err => {throw(handleError(err))})
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
        .catch(handleError)
}