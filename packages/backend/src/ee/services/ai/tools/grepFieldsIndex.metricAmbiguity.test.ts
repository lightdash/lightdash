import { describe, expect, it } from 'vitest';
import { buildMetricAmbiguityNote, type FieldEntry } from './grepFieldsIndex';

const entry = (over: Partial<FieldEntry>): FieldEntry => ({
    exploreName: 'explore_a',
    exploreLabel: 'Explore A',
    path: 'explore_a/a_metric',
    kind: 'metric',
    type: 'number',
    label: 'A metric',
    description: '',
    aiHint: '',
    haystack: '',
    verifiedUsage: 0,
    ...over,
});

describe('buildMetricAmbiguityNote', () => {
    it('flags competing metrics across ≥2 explores when none is verified', () => {
        const note = buildMetricAmbiguityNote([
            entry({ exploreName: 'rpt_conversion_events' }),
            entry({ exploreName: 'fct_conversion_events' }),
        ]);
        expect(note).not.toBeNull();
        expect(note).toMatch(/2 metrics/);
        expect(note).toMatch(/which metric and explore/i);
    });

    it('does not flag when all metric hits are in one explore', () => {
        expect(
            buildMetricAmbiguityNote([
                entry({ exploreName: 'rpt_x', path: 'rpt_x/m1' }),
                entry({ exploreName: 'rpt_x', path: 'rpt_x/m2' }),
            ]),
        ).toBeNull();
    });

    it('does not flag when a verified metric is present', () => {
        expect(
            buildMetricAmbiguityNote([
                entry({ exploreName: 'rpt_a', verifiedUsage: 3 }),
                entry({ exploreName: 'fct_b' }),
            ]),
        ).toBeNull();
    });

    it('ignores dimensions (only metrics compete here)', () => {
        expect(
            buildMetricAmbiguityNote([
                entry({ exploreName: 'rpt_a', kind: 'dimension' }),
                entry({ exploreName: 'fct_b', kind: 'dimension' }),
            ]),
        ).toBeNull();
    });

    it('does not flag a single metric hit', () => {
        expect(buildMetricAmbiguityNote([entry({})])).toBeNull();
    });
});
