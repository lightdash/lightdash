import { knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { OrganizationTableName } from '../../../database/entities/organizations';
import { ProjectTableName } from '../../../database/entities/projects';
import { getListProjectsScripts } from './listProjects';
import { queryMatcher } from './testUtils';

describe('listProjects', () => {
    let tracker: Tracker;
    const database = knex({ client: MockClient });
    const scripts = getListProjectsScripts(database);

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('should list all projects when no organization uuid is provided', async () => {
        const mockProjects = [
            {
                project_uuid: 'project-1',
                name: 'Project 1',
                organization_uuid: 'org-1',
                project_type: 'DEFAULT',
                created_at: new Date('2024-01-01'),
            },
            {
                project_uuid: 'project-2',
                name: 'Project 2',
                organization_uuid: 'org-2',
                project_type: 'DEFAULT',
                created_at: new Date('2024-01-02'),
            },
        ];

        tracker.on
            .select(queryMatcher(ProjectTableName))
            .response(mockProjects);

        const result = await scripts.listProjects();

        expect(result).toEqual(mockProjects);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).toContain('join');
        expect(tracker.history.select[0].sql).toContain(OrganizationTableName);
    });

    test('should filter projects by organization uuid when provided', async () => {
        const orgUuid = 'test-org-uuid';
        const mockProjects = [
            {
                project_uuid: 'project-1',
                name: 'Project 1',
                organization_uuid: orgUuid,
                project_type: 'DEFAULT',
                created_at: new Date('2024-01-01'),
            },
        ];

        tracker.on
            .select(queryMatcher(ProjectTableName, [orgUuid]))
            .response(mockProjects);

        const result = await scripts.listProjects(orgUuid);

        expect(result).toEqual(mockProjects);
        expect(tracker.history.select).toHaveLength(1);
        expect(tracker.history.select[0].sql).toContain('where');
        expect(tracker.history.select[0].bindings).toContain(orgUuid);
    });
});
