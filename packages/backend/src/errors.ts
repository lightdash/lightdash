import {Response} from "express";

type LightdashErrorParams = {
    message: string,
    name: string,
    statusCode: number,
    data: {[key: string]: any},
}

class LightdashError extends Error {
    statusCode: number
    data: {[key: string]: any}

    constructor({ message ,name, statusCode, data }: LightdashErrorParams) {
        super(message)
        this.name = name
        this.statusCode = statusCode
        this.data = data
    }
}

export class NotExistsError extends LightdashError {
    constructor(message: string) {
        super({
            message,
            name: 'NotExistsError',
            statusCode: 404,
            data: {},
        })
    }
}

export class MissingCatalogEntryError extends LightdashError {
    constructor(message: string, data: {[key: string]: any}) {
        super({
            message,
            name: 'MissingCatalogEntryError',
            statusCode: 400,
            data
        });
    }
}


export class ParseError extends LightdashError {
    constructor(message = 'Error parsing dbt project and lightdash metadata', data: {[key: string]: any}) {
        super({
            message,
            name: 'ParseError',
            statusCode: 500,
            data
        });
    }
}

export class QueryError extends LightdashError {
    constructor(message = 'Error running query on external service', data: {[key: string]: any}) {
        super({
            message,
            name: 'ExternalQueryError',
            statusCode: 400,
            data,
        });
    }
}

export class NetworkError extends LightdashError {
    constructor(message = 'Error connecting to external service', data: {[key: string]: any}) {
        super({
            message,
            name: 'NetworkError',
            statusCode: 500,
            data,
        })
    }
}

export class DbtError extends LightdashError {
    constructor(message = 'Dbt raised an error', data: {[key: string]: any}) {
        super({
            message,
            name: 'DbtError',
            statusCode: 500,
            data
        });
    }
}

export const errorHandler = async (error: Error, res: Response) => {
    // console.error(error.stack)
    if (error instanceof LightdashError) {
        res.status(error.statusCode).send({
            status: 'error',
            error: {
                statusCode: error.statusCode,
                name: error.name,
                message: error.message,
                data: error.data
            }
        })
    }
    else {
        console.error(error)
        res.status(500).send({
            status: 'error',
            error: {
                statusCode: 500,
                name: 'UnexpectedServerError',
                message: `${error}`,
                data: {}
            }
        })
    }
}