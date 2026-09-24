import {
    ParameterError,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { getConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';
import {
    resolveProjectSourceUuid,
    selectProjectSource,
} from './sourceSelection';

vi.mock('../config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../config')>()),
    getConfig: vi.fn(),
}));
vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const source = (
    projectDbtSourceUuid: string,
    name: string,
): ProjectDbtSourceSummary => ({
    projectDbtSourceUuid,
    name,
    isPrimary: projectDbtSourceUuid === 'primary-uuid',
    precedence: 0,
    type: null,
    repository: null,
    branch: null,
    projectSubPath: null,
    warehouseLocation: { database: null, schema: null },
    hasCredentialError: false,
});

const sources = [
    source('primary-uuid', 'dbt_project'),
    source('finance-uuid', 'finance'),
];

describe('selectProjectSource', () => {
    test('returns the source with the given name', () => {
        expect(selectProjectSource(sources, 'finance')).toEqual(sources[1]);
    });

    test('refuses an unknown name and lists the sources of the project', () => {
        expect(() => selectProjectSource(sources, 'marketing')).toThrow(
            ParameterError,
        );
        expect(() => selectProjectSource(sources, 'marketing')).toThrow(
            'The dbt source "marketing" does not belong to this project.\n\nAvailable sources:\n  - dbt_project\n  - finance',
        );
    });
});

describe('resolveProjectSourceUuid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue(sources as never);
    });

    test('sends no request and returns no source when none is chosen', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: { project: 'project-uuid' },
        } as never);

        await expect(
            resolveProjectSourceUuid('project-uuid', undefined),
        ).resolves.toBeUndefined();
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    test('resolves the --source name against the dbt sources of the project', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: { project: 'project-uuid', source: 'dbt_project' },
        } as never);

        await expect(
            resolveProjectSourceUuid('project-uuid', 'finance'),
        ).resolves.toBe('finance-uuid');
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/v1/projects/project-uuid/dbt-sources',
            body: undefined,
        });
    });

    test('uses the configured source only for the configured project', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: { project: 'project-uuid', source: 'finance' },
        } as never);

        await expect(
            resolveProjectSourceUuid('project-uuid', undefined),
        ).resolves.toBe('finance-uuid');
        await expect(
            resolveProjectSourceUuid('other-project-uuid', undefined),
        ).resolves.toBeUndefined();
    });

    test('resolves the source configured for the upstream against the sources of its preview', async () => {
        vi.mocked(getConfig).mockResolvedValue({
            context: { project: 'upstream-uuid', source: 'finance' },
        } as never);

        await expect(
            resolveProjectSourceUuid(
                'preview-uuid',
                undefined,
                'upstream-uuid',
            ),
        ).resolves.toBe('finance-uuid');
        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/v1/projects/preview-uuid/dbt-sources',
            body: undefined,
        });
    });
});
