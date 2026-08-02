import {
    ParameterError,
    ValidationErrorType,
    ValidationResponse,
    ValidationSourceType,
} from '@lightdash/common';
import {
    filterValidationsBySpace,
    resolveSpaceSelection,
} from './validateSpaceFilter';

const space = (
    uuid: string,
    slug: string,
    parentSpaceUuid: string | null = null,
) => ({ uuid, slug, parentSpaceUuid });

// marketing; archive > archive-2024 > deep-child; second root space also slugged "archive"
const spaces = [
    space('s1', 'marketing'),
    space('s2', 'archive'),
    space('s3', 'archive-2024', 's2'),
    space('s4', 'deep-child', 's3'),
    space('s5', 'archive'),
];

const base = {
    validationUuid: 'v1',
    validationId: null,
    createdAt: new Date(),
    error: 'error message',
    projectUuid: 'p1',
};

const chartError = (spaceUuid?: string): ValidationResponse =>
    ({
        ...base,
        name: 'chart',
        errorType: ValidationErrorType.Chart,
        source: ValidationSourceType.Chart,
        chartUuid: 'c1',
        chartViews: 0,
        spaceUuid,
    }) as ValidationResponse;

const dashboardError = (spaceUuid?: string): ValidationResponse =>
    ({
        ...base,
        name: 'dashboard',
        errorType: ValidationErrorType.Chart,
        source: ValidationSourceType.Dashboard,
        dashboardUuid: 'd1',
        dashboardViews: 0,
        spaceUuid,
    }) as ValidationResponse;

const tableError = (): ValidationResponse =>
    ({
        ...base,
        name: 'table',
        errorType: ValidationErrorType.Model,
        source: ValidationSourceType.Table,
    }) as ValidationResponse;

describe('resolveSpaceSelection', () => {
    it('selects a space by slug', () => {
        expect(resolveSpaceSelection(spaces, ['marketing'])).toEqual(
            new Set(['s1']),
        );
    });

    it('cascades into nested sub-spaces recursively', () => {
        // s2 selected -> s3 and s4 follow; s5 shares the slug and is also selected
        expect(resolveSpaceSelection(spaces, ['archive'])).toEqual(
            new Set(['s2', 's3', 's4', 's5']),
        );
    });

    it('selects a mid-tree space with its descendants only', () => {
        expect(resolveSpaceSelection(spaces, ['archive-2024'])).toEqual(
            new Set(['s3', 's4']),
        );
    });

    it('throws ParameterError listing available slugs on unknown slug', () => {
        expect(() => resolveSpaceSelection(spaces, ['typo'])).toThrow(
            ParameterError,
        );
        expect(() => resolveSpaceSelection(spaces, ['typo'])).toThrow(
            /typo.*archive.*marketing/s,
        );
    });
});

describe('filterValidationsBySpace', () => {
    const selection = new Set(['s2']);

    it('include mode keeps only errors in selected spaces', () => {
        const kept = filterValidationsBySpace(
            [chartError('s1'), chartError('s2'), dashboardError('s2')],
            selection,
            'include',
        );
        expect(kept).toHaveLength(2);
    });

    it('exclude mode drops errors in selected spaces', () => {
        const kept = filterValidationsBySpace(
            [chartError('s1'), chartError('s2'), dashboardError('s2')],
            selection,
            'exclude',
        );
        expect(kept).toHaveLength(1);
    });

    it('never filters table errors', () => {
        expect(
            filterValidationsBySpace([tableError()], selection, 'include'),
        ).toHaveLength(1);
        expect(
            filterValidationsBySpace([tableError()], selection, 'exclude'),
        ).toHaveLength(1);
    });

    it('keeps errors without spaceUuid under exclude, drops them under include', () => {
        expect(
            filterValidationsBySpace(
                [chartError(undefined)],
                selection,
                'exclude',
            ),
        ).toHaveLength(1);
        expect(
            filterValidationsBySpace(
                [chartError(undefined)],
                selection,
                'include',
            ),
        ).toHaveLength(0);
    });
});
