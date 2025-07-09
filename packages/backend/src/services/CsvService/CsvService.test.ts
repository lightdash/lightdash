import { DimensionType, Field } from '@lightdash/common';
import * as fs from 'fs/promises';
import moment from 'moment';
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
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
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
import {
    generateCsvFileId,
    generateGenericFileId,
    isRowValueDate,
    isRowValueTimestamp,
    isValidCsvFileId,
    sanitizeGenericFileName,
    streamJsonlData,
} from '../../utils/FileDownloadUtils/FileDownloadUtils';
import { AsyncQueryService } from '../AsyncQueryService/AsyncQueryService';
import { ProjectService } from '../ProjectService/ProjectService';
import { CsvService } from './CsvService';
import { itemMap, metricQuery } from './CsvService.mock';

describe('CsvService', () => {
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
        }),
        asyncQueryService: {} as AsyncQueryService,
        s3Client: {} as S3Client,
        savedChartModel: {} as SavedChartModel,
        dashboardModel: {} as DashboardModel,
        downloadFileModel: {} as DownloadFileModel,
        schedulerClient: {} as SchedulerClient,
        projectModel: {} as ProjectModel,
        savedSqlModel: {} as SavedSqlModel,
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

    it('Should generate csv file ids', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(timestamp).toEqual(`2023-09-07-12-13-45-1230`);

        expect(generateCsvFileId('payment', false, time)).toEqual(
            `csv-payment-${timestamp}.csv`,
        );
        expect(generateCsvFileId('MyTable', false, time)).toEqual(
            `csv-MyTable-${timestamp}.csv`,
        );
        expect(generateCsvFileId('my table', false, time)).toEqual(
            `csv-my table-${timestamp}.csv`,
        );
        expect(generateCsvFileId('table!', false, time)).toEqual(
            `csv-table!-${timestamp}.csv`,
        );
        expect(generateCsvFileId('this is a chart title', false, time)).toEqual(
            `csv-this is a chart title-${timestamp}.csv`,
        );
        expect(
            generateCsvFileId('another table (for testing)', false, time),
        ).toEqual(`csv-another table (for testing)-${timestamp}.csv`);
        expect(generateCsvFileId('weird chars *!"()_-', false, time)).toEqual(
            `csv-weird chars _!_()_--${timestamp}.csv`,
        );

        // Test without time
        expect(generateCsvFileId('payment')).toContain(`csv-payment-`);
    });

    it('Should generate csv file for incomplete file', async () => {
        const time = moment('2023-09-07 12:13:45.123');
        const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');

        expect(generateCsvFileId('payment', true, time)).toEqual(
            `csv-incomplete_results-payment-${timestamp}.csv`,
        );
        // Test without time
        expect(generateCsvFileId('payment', true)).toContain(
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
            expect(name + isValidCsvFileId(name)).toEqual(name + true);
        });
        invalidNames.forEach((name) => {
            expect(name + isValidCsvFileId(name)).toEqual(name + false);
        });
    });
});
