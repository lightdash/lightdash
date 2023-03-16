import * as fs from 'fs';
import { dashboardModel, savedChartModel } from '../../models/models';
import { projectService, s3Service } from '../services';
import { CsvService } from './CsvService';
import { itemMap, metricQuery, rows } from './CsvService.mock';

jest.mock('../../models/models', () => ({
    savedChartModel: {},
    dashboardModel: {},
}));

jest.mock('../services', () => ({
    s3Service: {},
    projectService: {},
}));

describe('Csv service', () => {
    const csvService = new CsvService({
        projectService,
        s3Service,
        savedChartModel,
        dashboardModel,
    });

    it('Should convert rows to CSV with format', async () => {
        const fileId = await CsvService.convertRowsToCsv(
            [...rows],
            false,
            metricQuery,
            itemMap,
            false,
            {},
            [],
        );

        const csvContent = fs.readFileSync(`/tmp/${fileId}`, 'utf-8');

        expect(csvContent).toEqual(
            `column number,column string,column date
$0.00,value_0,2020-03-16
$1.00,value_1,2020-03-16
$2.00,value_2,2020-03-16
$3.00,value_3,2020-03-16
$4.00,value_4,2020-03-16
`,
        );
    });

    it('Should convert rows to RAW CSV with table names', async () => {
        const fileId = await CsvService.convertRowsToCsv(
            [...rows],
            true,
            metricQuery,
            itemMap,
            true,
            {},
            [],
        );

        const csvContent = fs.readFileSync(`/tmp/${fileId}`, 'utf-8');

        expect(csvContent).toEqual(
            `table column number,column string,table column date
0,value_0,2020-03-16
1,value_1,2020-03-16
2,value_2,2020-03-16
3,value_3,2020-03-16
4,value_4,2020-03-16
`,
        );
    });
});
