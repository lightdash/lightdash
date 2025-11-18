import * as fs from 'fs/promises';
import moment from 'moment';
import { Readable, Writable } from 'stream';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import { S3Client } from '../../clients/Aws/S3Client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../../config/lightdashConfig';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { PivotTableService } from '../PivotTableService/PivotTableService';
import { ProjectService } from '../ProjectService/ProjectService';
import { CsvService } from './CsvService';
import { itemMap, metricQuery } from './CsvService.mock';

describe('Csv service', () => {
    const csvService = new CsvService({
        lightdashConfig,
        analytics: analyticsMock,
        userModel: {} as UserModel,
        projectService: new ProjectService({
            lightdashConfig,
            analytics: analyticsMock,
            analyticsModel: {} as AnalyticsModel,
            dashboardModel: {} as DashboardModel,
            emailClient: {} as EmailClient,
            jobModel: {} as JobModel,
            onboardingModel: {} as OnboardingModel,
            projectModel: {} as ProjectModel,
            s3CacheClient: {} as S3CacheClient,
            savedChartModel: {} as SavedChartModel,
            spaceModel: {} as SpaceModel,
            sshKeyPairModel: {} as SshKeyPairModel,
            userAttributesModel: {} as UserAttributesModel,
            userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
            warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
            emailModel: {
                getPrimaryEmailStatus: (userUuid: string) => ({
                    isVerified: true,
                }),
            } as unknown as EmailModel,
            schedulerClient: {} as SchedulerClient,
            downloadFileModel: {} as DownloadFileModel,
            s3Client: {} as S3Client,
            groupsModel: {} as GroupsModel,
            tagsModel: {} as TagsModel,
            catalogModel: {} as CatalogModel,
            contentModel: {} as ContentModel,
            encryptionUtil: {} as EncryptionUtil,
            userModel: {} as UserModel,
            featureFlagModel: {} as FeatureFlagModel,
            projectParametersModel: {} as ProjectParametersModel,
            organizationWarehouseCredentialsModel:
                {} as OrganizationWarehouseCredentialsModel,
            projectCompileLogModel: {} as ProjectCompileLogModel,
        }),
        s3Client: {} as S3Client,
        savedChartModel: {} as SavedChartModel,
        dashboardModel: {} as DashboardModel,
        downloadFileModel: {} as DownloadFileModel,
        schedulerClient: {} as SchedulerClient,
        projectModel: {} as ProjectModel,
        savedSqlModel: {} as SavedSqlModel,
        pivotTableService: new PivotTableService({
            lightdashConfig,
            s3Client: {} as S3Client,
            downloadFileModel: {} as DownloadFileModel,
        }),
    });

    it('Should convert rows to CSV with format', async () => {
        const rows = [...Array(5).keys()].map((i) => ({
            column_number: i,
            column_string: `value_${i}`,
            column_date: '2020-03-16T11:32:55.000Z',
        }));
        const fileId = await CsvService.writeRowsToFile(
            rows,
            false,
            metricQuery,
            itemMap,
            false,
            'explore',
            false,
            {},
            [],
        );

        const csvContent = await fs.readFile(`/tmp/${fileId}`, {
            encoding: 'utf-8',
        });

        expect(csvContent).toEqual(
            // eslint-disable-next-line no-irregular-whitespace
            `﻿column number,column string,column date
$0.00,value_0,2020-03-16
$1.00,value_1,2020-03-16
$2.00,value_2,2020-03-16
$3.00,value_3,2020-03-16
$4.00,value_4,2020-03-16
`,
        );
    });

    it('Should convert rows to RAW CSV with table names', async () => {
        const rows = [...Array(5).keys()].map((i) => ({
            column_number: i,
            column_string: `value_${i}`,
            column_date: '2020-03-16T11:32:55.000Z',
        }));
        const fileId = await CsvService.writeRowsToFile(
            rows,
            true,
            metricQuery,
            itemMap,
            true,
            'explore',
            false,
            {},
            [],
        );

        const csvContent = await fs.readFile(`/tmp/${fileId}`, {
            encoding: 'utf-8',
        });

        expect(csvContent).toEqual(
            // eslint-disable-next-line no-irregular-whitespace
            `﻿table column number,column string,table column date
0,value_0,2020-03-16
1,value_1,2020-03-16
2,value_2,2020-03-16
3,value_3,2020-03-16
4,value_4,2020-03-16
`,
        );
    });

    it('Should convert rows to csv', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual(['$1.00', 'value_1', '2020-03-16']);
    });
    it('Should convert RAW rows to csv', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, true, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual([1, 'value_1', '2020-03-16']);
    });

    it('Should convert with row with null date', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_date: null,
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual(['$1.00', 'value_1', null]);
    });

    it('Should convert with row with undefined value', async () => {
        const row = {
            column_number: undefined,
            column_string: `value_1`,
            column_date: '2020-03-16T11:32:55.000Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_date',
        ]);

        expect(csv).toEqual([undefined, 'value_1', '2020-03-16']);
    });

    it('Should preserve milliseconds when converting timestamp rows to csv', async () => {
        const row = {
            column_number: 1,
            column_string: `value_1`,
            column_timestamp: '2020-03-16T11:32:55.123Z',
        };

        const csv = CsvService.convertRowToCsv(row, itemMap, false, [
            'column_number',
            'column_string',
            'column_timestamp',
        ]);

        expect(csv).toEqual(['$1.00', 'value_1', '2020-03-16 11:32:55.123']);
    });

    it('Should generate csv file ids', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(timestamp).toEqual(`2023-09-07-12-13-45-1230`);

        expect(CsvService.generateFileId('payment', false, time)).toEqual(
            `csv-payment-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('MyTable', false, time)).toEqual(
            `csv-MyTable-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('my table', false, time)).toEqual(
            `csv-my table-${timestamp}.csv`,
        );
        expect(CsvService.generateFileId('table!', false, time)).toEqual(
            `csv-table!-${timestamp}.csv`,
        );
        expect(
            CsvService.generateFileId('this is a chart title', false, time),
        ).toEqual(`csv-this is a chart title-${timestamp}.csv`);
        expect(
            CsvService.generateFileId(
                'another table (for testing)',
                false,
                time,
            ),
        ).toEqual(`csv-another table (for testing)-${timestamp}.csv`);
        expect(
            CsvService.generateFileId('weird chars *!"()_-', false, time),
        ).toEqual(`csv-weird chars _!_()_--${timestamp}.csv`);

        // Test without time
        expect(CsvService.generateFileId('payment')).toContain(`csv-payment-`);
    });

    it('Should generate csv file for incomplete file', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(CsvService.generateFileId('payment', true, time)).toEqual(
            `csv-incomplete_results-payment-${timestamp}.csv`,
        );
        // Test without time
        expect(CsvService.generateFileId('payment', true)).toContain(
            `csv-incomplete_results-payment-`,
        );
    });

    it('isValidCsvFileId', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        const validNames = [
            `csv-payment-${timestamp}.csv`,
            `csv-MyTable-${timestamp}.csv`,
            `csv-my table-${timestamp}.csv`,
            `csv-table!-${timestamp}.csv`,
            `csv-this is a chart title-${timestamp}.csv`,
            `csv-another table (for testing)-${timestamp}.csv`,
            `csv-weird chars _!_()_--${timestamp}.csv`,
            `csv-incomplete_results-payment-${timestamp}.csv`,
        ];

        const invalidNames = [
            `without_prefix-${timestamp}.csv`,
            `csv-without_suffix-${timestamp}`,
            `csv-no_timestamp.csv`,
            `csv-file/invalid-${timestamp}.csv`,
            `csv-file\\invalid-${timestamp}.csv`,
        ];
        validNames.forEach((name) => {
            expect(name + CsvService.isValidCsvFileId(name)).toEqual(
                name + true,
            );
        });
        invalidNames.forEach((name) => {
            expect(name + CsvService.isValidCsvFileId(name)).toEqual(
                name + false,
            );
        });
    });

    it('Should handle Japanese multibyte characters in JSONL streaming without corruption', async () => {
        // Create JSONL data with Japanese characters
        const jsonlData = [
            JSON.stringify({
                column_number: 1,
                column_string: '日本語テスト',
                column_date: '2020-03-16T11:32:55.000Z',
            }),
            JSON.stringify({
                column_number: 2,
                column_string: 'あああいいい',
                column_date: '2020-03-17T11:32:55.000Z',
            }),
            JSON.stringify({
                column_number: 3,
                column_string: '漢字テスト🎌',
                column_date: '2020-03-18T11:32:55.000Z',
            }),
        ].join('\n');

        // Create a custom readable stream that chunks data in a way that can split multibyte characters
        const chunkSize = 7; // Small chunk size to force splitting multibyte characters
        const chunks: Buffer[] = [];
        const buffer = Buffer.from(jsonlData, 'utf8');

        for (let i = 0; i < buffer.length; i += chunkSize) {
            chunks.push(buffer.subarray(i, i + chunkSize));
        }

        const readStream = new Readable({
            read() {
                const chunk = chunks.shift();
                this.push(chunk || null);
            },
        });

        // Create write stream to capture output
        let csvOutput = '';
        const writeStream = new Writable({
            write(chunk, encoding, callback) {
                csvOutput += chunk.toString();
                callback();
            },
        });

        // Process the stream
        await CsvService.streamJsonlRowsToFile(
            false,
            itemMap,
            ['column_number', 'column_string', 'column_date'],
            ['column number', 'column string', 'column date'],
            {
                readStream,
                writeStream,
            },
        );

        // Verify the output contains correct Japanese characters without corruption
        expect(csvOutput).toContain('日本語テスト');
        expect(csvOutput).toContain('あああいいい');
        expect(csvOutput).toContain('漢字テスト🎌');

        // Verify the structure is correct (BOM + header + 3 data rows)
        const lines = csvOutput.split('\n');
        expect(lines[0]).toContain('column number,column string,column date');
        expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 rows + possible empty line
    });
});
