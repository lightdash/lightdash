import {
    DbtProjectType,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { selectProjectSource } from './sourceSelection';

const source = (name: string): ProjectDbtSourceSummary => ({
    projectDbtSourceUuid: `${name}-uuid`,
    connectionUuid: `${name}-connection`,
    namespacePrefix: '',
    name,
    isPrimary: name === 'analytics',
    precedence: 0,
    type: DbtProjectType.NONE,
    repository: null,
    branch: null,
    projectSubPath: null,
    warehouseLocation: { database: 'warehouse', schema: 'analytics' },
    hasCredentialError: false,
});

describe('selectProjectSource', () => {
    const analytics = source('analytics');
    const reporting = source('reporting');

    it('selects the only source without configuration', () => {
        expect(selectProjectSource([analytics])).toBe(analytics);
    });

    it('selects a configured source when the project has several', () => {
        expect(selectProjectSource([analytics, reporting], 'reporting')).toBe(
            reporting,
        );
    });

    it('lets a per-run source name select a source', () => {
        expect(selectProjectSource([analytics, reporting], 'analytics')).toBe(
            analytics,
        );
    });

    it('refuses several sources without a selection and lists them', () => {
        expect(() => selectProjectSource([analytics, reporting])).toThrow(
            'This project has several dbt sources. Set one with lightdash config set-source <name> or pass --source <name>.\n\nAvailable sources:\n  - analytics\n  - reporting',
        );
    });

    it('refuses an unknown source and lists the available names', () => {
        expect(() =>
            selectProjectSource([analytics, reporting], 'missing'),
        ).toThrow(
            'The dbt source "missing" does not belong to this project.\n\nAvailable sources:\n  - analytics\n  - reporting',
        );
    });
});
