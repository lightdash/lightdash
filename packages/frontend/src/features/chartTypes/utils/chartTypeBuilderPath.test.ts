import { describe, expect, it } from 'vitest';
import { chartTypeBuilderPath } from './chartTypeBuilderPath';

describe('chartTypeBuilderPath', () => {
    it('builds the create path when no dataAppVizUuid is given', () => {
        expect(chartTypeBuilderPath('project-uuid')).toBe(
            '/projects/project-uuid/chart-types/new',
        );
    });

    it('builds the create path when dataAppVizUuid is explicitly null', () => {
        expect(chartTypeBuilderPath('project-uuid', null)).toBe(
            '/projects/project-uuid/chart-types/new',
        );
    });

    it('builds the edit path when a dataAppVizUuid is given', () => {
        expect(chartTypeBuilderPath('project-uuid', 'viz-uuid')).toBe(
            '/projects/project-uuid/chart-types/viz-uuid',
        );
    });
});
