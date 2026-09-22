import { type Explore } from '@lightdash/common';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { joinedMeasureGuidance } from './sourceEvidence';

const joined: Explore = {
    ...validExplore,
    name: 'reporting_view',
    baseTable: 'reporting_rows',
    tables: {
        ...validExplore.tables,
        reporting_rows: {
            ...validExplore.tables.a,
            name: 'reporting_rows',
            dimensions: {},
            metrics: {},
        },
    },
};
describe('source coverage evidence', () => {
    it.each([0, '0', null])(
        'qualifies a joined zero/null and identifies an available direct source: %s',
        (value) => {
            const note = joinedMeasureGuidance(
                ['a_met1'],
                joined,
                [{ a_met1: value }],
                [joined, validExplore],
            );
            expect(note).toContain('a_met1 belongs to a');
            expect(note).toContain('direct-source explores');
            expect(note).toContain('does not establish source-wide absence');
        },
    );
    it('does not warn about direct-source zeros or positive joined values', () => {
        expect(
            joinedMeasureGuidance(
                ['a_met1'],
                validExplore,
                [{ a_met1: 0 }],
                [validExplore],
            ),
        ).toBe('');
        expect(
            joinedMeasureGuidance(
                ['a_met1'],
                joined,
                [{ a_met1: 4 }],
                [joined],
            ),
        ).toBe('');
    });
    it('does not warn when a joined measure has any observed nonzero value', () => {
        expect(
            joinedMeasureGuidance(
                ['a_met1'],
                joined,
                [{ a_met1: 0 }, { a_met1: null }, { a_met1: 4 }],
                [joined, validExplore],
            ),
        ).toBe('');
    });
    it('does not invent inaccessible alternative sources', () => {
        expect(
            joinedMeasureGuidance(
                ['a_met1'],
                joined,
                [{ a_met1: 0 }],
                [joined],
            ),
        ).not.toContain('direct-source explores');
    });
});
