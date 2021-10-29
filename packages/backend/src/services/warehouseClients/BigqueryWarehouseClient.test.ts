import { BigQuery } from '@google-cloud/bigquery';
import BigqueryWarehouseClient from './BigqueryWarehouseClient';
import {
    config,
    createJobResponse,
    credentials,
    expectedRow,
    expectedWarehouseSchema,
    getDatasetResponse,
    getTableResponse,
} from './BigqueryWarehouseClient.mock';

describe('BigqueryWarehouseClient', () => {
    it('expect query rows with mapped values', async () => {
        BigQuery.prototype.createQueryJob = jest.fn();
        const warehouse = new BigqueryWarehouseClient(credentials);
        (warehouse.client.createQueryJob as jest.Mock).mockImplementationOnce(
            () => createJobResponse,
        );
        expect((await warehouse.runQuery('fake sql'))[0]).toEqual(expectedRow);
    });
    it('expect schema with bigquery types mapped to dimension types', async () => {
        const getDatasetMock = jest
            .fn()
            .mockImplementationOnce(() => getDatasetResponse);
        BigQuery.prototype.dataset = getDatasetMock;
        const warehouse = new BigqueryWarehouseClient(credentials);
        expect(await warehouse.getSchema(config)).toEqual(
            expectedWarehouseSchema,
        );
        expect(getDatasetMock).toHaveBeenCalledTimes(1);
        expect(getDatasetResponse.table).toHaveBeenCalledTimes(1);
        expect(getTableResponse.getMetadata).toHaveBeenCalledTimes(1);
    });
});
