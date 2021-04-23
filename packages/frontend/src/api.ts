import {Explore} from "common";

const headers = {
    'Content-Type': 'application/json'
}

export const getExplores = async (forceRefresh: boolean): Promise<Explore[]> => {
    const url = forceRefresh ? '/explores?forceRefresh' : '/explores'
    return fetch(url, {method: 'GET', headers})
        .then(r => {
            if (!r.ok) {
                throw Error(`Failed to connect to backend server: ${r.statusText}`)
            }
            return r
        })
        .then(r => r.json())
}

export const runQuery = async (query: string): Promise<{[col: string]: any}[]> => {
    const url = '/query'
    const body = JSON.stringify({ query })
    return fetch(url, { method: 'POST', headers, body })
        .then(r => {
            if (!r.ok) {
                throw Error(`Failed to connect to backend server: ${r.statusText}`)
            }
            return r
        })
        .then(r => r.json())
}