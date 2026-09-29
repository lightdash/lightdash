import { describe, expect, it } from 'vitest';
import {
    chartTypeBuilderPath,
    chartTypeGalleryPath,
} from './chartTypeBuilderPath';

describe('chartTypeBuilderPath', () => {
    it('builds the create path when dataAppVizUuid is explicitly null', () => {
        expect(chartTypeBuilderPath('project-uuid', null, 'project')).toBe(
            '/projects/project-uuid/chart-studio/new',
        );
    });

    it('builds the edit path when a dataAppVizUuid is given', () => {
        expect(
            chartTypeBuilderPath('project-uuid', 'viz-uuid', 'project'),
        ).toBe('/projects/project-uuid/chart-studio/viz-uuid');
    });
});

describe('organization chart types', () => {
    it('builds the organization create path under the data project', () => {
        expect(chartTypeBuilderPath('project-uuid', null, 'organization')).toBe(
            '/projects/project-uuid/chart-studio/organization/new',
        );
    });

    it('builds the organization edit path', () => {
        expect(
            chartTypeBuilderPath('project-uuid', 'viz-slug', 'organization'),
        ).toBe('/projects/project-uuid/chart-studio/organization/viz-slug');
    });

    it('returns to the matching gallery tab', () => {
        expect(chartTypeGalleryPath('project-uuid', 'project')).toBe(
            '/projects/project-uuid/chart-studio',
        );
        expect(chartTypeGalleryPath('project-uuid', 'organization')).toBe(
            '/projects/project-uuid/chart-studio?tab=organization-library',
        );
    });
});
