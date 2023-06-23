import { convertFieldRefToFieldId, MetricFilterRule } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import { ProjectTableName } from '../../database/entities/projects';
import { ProjectModel } from './ProjectModel';
import {
    encryptionServiceMock,
    expectedProject,
    expectedTablesConfiguration,
    lightdashConfigMock,
    mockExploresFromCache,
    projectMock,
    projectUuid,
    tableSelectionMock,
    updateTableSelectionMock,
} from './ProjectModel.mock';

function queryMatcher(
    tableName: string,
    params: any[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && bindings[index] === arg,
            true,
        );
}

describe('ProjectModel', () => {
    const model = new ProjectModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: lightdashConfigMock,
        encryptionService: encryptionServiceMock,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });
    test('should get project with no sensitive properties', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([projectMock]);

        const project = await model.get(projectUuid);
        expect(project).toEqual(expectedProject);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should get project tables configuration', async () => {
        tracker.on
            .select(queryMatcher(ProjectTableName, [projectUuid]))
            .response([tableSelectionMock]);

        const result = await model.getTablesConfiguration(projectUuid);

        expect(result).toEqual(expectedTablesConfiguration);
        expect(tracker.history.select).toHaveLength(1);
    });
    test('should update project tables configuration', async () => {
        tracker.on
            .update(
                queryMatcher(ProjectTableName, [
                    updateTableSelectionMock.tableSelection.type,
                    updateTableSelectionMock.tableSelection.value,
                    projectUuid,
                ]),
            )
            .response([]);

        await model.updateTablesConfiguration(
            projectUuid,
            updateTableSelectionMock,
        );

        expect(tracker.history.update).toHaveLength(1);
    });

    describe('should update outdated metric filters in explores', () => {
        const fieldRefsToTest: {
            fieldRef: string;
            tableName: string;
            isOutdated: boolean;
        }[] = [];
        const convertedExplore =
            ProjectModel.convertMetricFiltersFieldIdsToFieldRef(
                mockExploresFromCache[0],
            );

        const isOutdatedMetricFilter = (filter: MetricFilterRule) =>
            'fieldId' in filter.target;

        const isMetricFilterFromJoinedTable = (fieldRef: string) =>
            fieldRef.split('.').length === 2;

        test('should add fieldRef property from metric filters fieldId', () => {
            Object.values(convertedExplore.tables).forEach((table) => {
                Object.values(table.metrics).forEach((metric) => {
                    metric.filters?.forEach((filter) => {
                        fieldRefsToTest.push({
                            fieldRef: filter.target.fieldRef,
                            tableName: metric.name,
                            isOutdated: isOutdatedMetricFilter(filter),
                        });
                        if (isOutdatedMetricFilter(filter)) {
                            expect(filter.target.fieldRef).toBe(
                                // @ts-expect-error fieldId is allowed for outdated explores
                                filter.target.fieldId,
                            );
                        } else {
                            expect(filter.target.fieldRef).toBe(
                                filter.target.fieldRef,
                            );
                        }
                    });
                });
            });

            expect(fieldRefsToTest.filter((f) => f.isOutdated)).toHaveLength(2);
        });

        test('should convert fieldRefs to fieldIds for regular metric filters and filters that target joined models', () => {
            fieldRefsToTest.forEach(({ fieldRef, tableName }) => {
                if (isMetricFilterFromJoinedTable(fieldRef)) {
                    expect(convertFieldRefToFieldId(fieldRef)).toBe(
                        `${fieldRef.split('.')[0]}_${fieldRef.split('.')[1]}`,
                    );
                } else {
                    expect(convertFieldRefToFieldId(fieldRef, tableName)).toBe(
                        `${tableName}_${fieldRef}`,
                    );
                }
            });
        });
    });
});
