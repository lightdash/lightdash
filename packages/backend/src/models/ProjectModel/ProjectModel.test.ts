import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { FunctionQueryMatcher } from 'knex-mock-client/types/mock-client';
import { ProjectModel } from './ProjectModel';
import { ProjectTableName } from '../../database/entities/projects';
import {
    lightdashConfigMock,
    encryptionServiceMock,
    projectMock,
    expectedProject,
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
            .select(queryMatcher(ProjectTableName, [projectMock.projectUuid]))
            .response([projectMock]);

        const project = await model.get(projectMock.projectUuid);

        expect(project).toEqual(expectedProject);
        expect(tracker.history.select).toHaveLength(1);
    });
});
