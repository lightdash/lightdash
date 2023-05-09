import { BigQuery } from '@google-cloud/bigquery';

import { Readable } from 'stream';
import { BigqueryWarehouseClient } from './BigqueryWarehouseClient';
import {
    createJobResponse,
    credentials,
    getDatasetResponse,
    getTableResponse,
    rows,
} from './BigqueryWarehouseClient.mock';
import {
    config,
    expectedFields,
    expectedRow,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

const mockStreamRow = () =>
    new Readable({
        objectMode: true,
        read() {
            rows.forEach((row) => this.push(row));
            this.push(null);
        },
    });

/*
jest.mock('./BigqueryWarehouseClient', () => {
    return jest.fn().mockImplementationOnce(() => {
        return {
            getQuerySchema: jest.fn(() => expectedFields)
        }
           
    });
}); */

describe('BigqueryWarehouseClient', () => {
    it.only('expect query rows with mapped values', async () => {
        const warehouse = new BigqueryWarehouseClient(credentials);

        (warehouse.client.createQueryStream as jest.Mock) =
            jest.fn(mockStreamRow);
        // (warehouse.client.createQueryJob  as jest.Mock)= jest.fn( mockStreamRow)

        const results = await warehouse.runQuery('fake sql');

        // expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(expectedRow);
        expect(
            warehouse.client.createQueryStream as jest.Mock,
        ).toHaveBeenCalledTimes(1);
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        const getDatasetMock = jest
            .fn()
            .mockImplementationOnce(() => getDatasetResponse);
        BigQuery.prototype.dataset = getDatasetMock;
        const warehouse = new BigqueryWarehouseClient(credentials);
        expect(await warehouse.getCatalog(config)).toEqual(
            expectedWarehouseSchema,
        );
        expect(getDatasetMock).toHaveBeenCalledTimes(1);
        expect(getDatasetResponse.table).toHaveBeenCalledTimes(1);
        expect(getTableResponse.getMetadata).toHaveBeenCalledTimes(1);
    });
});
