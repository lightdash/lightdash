import { ParseError } from '../../types/errors';
import {
    loadProjectContextFile,
    mergeProjectContextEntry,
    serializeProjectContextFile,
    type ProjectContextEntry,
} from './projectContext';

const entry = (
    overrides: Partial<ProjectContextEntry> & Pick<ProjectContextEntry, 'id'>,
): ProjectContextEntry => ({
    kind: 'context',
    content: 'content',
    terms: [],
    objects: [],
    ...overrides,
});

describe('loadProjectContextFile', () => {
    test('parses a fully-specified entry', () => {
        const yaml = `
- id: hr-abbreviation
  kind: definition
  content: '"HR" = the high-risk diabetes cohort, not human resources.'
  terms: [HR, high risk]
  objects: [patient_health_scores.diabetes_risk_category]
`;
        expect(loadProjectContextFile(yaml)).toEqual([
            {
                id: 'hr-abbreviation',
                kind: 'definition',
                content:
                    '"HR" = the high-risk diabetes cohort, not human resources.',
                terms: ['HR', 'high risk'],
                objects: ['patient_health_scores.diabetes_risk_category'],
            },
        ]);
    });

    test('applies defaults for optional fields', () => {
        const yaml = `
- id: fiscal-year
  kind: context
  content: 'Fiscal year starts in February.'
`;
        expect(loadProjectContextFile(yaml)).toEqual([
            {
                id: 'fiscal-year',
                kind: 'context',
                content: 'Fiscal year starts in February.',
                terms: [],
                objects: [],
            },
        ]);
    });

    test('strips legacy global fields', () => {
        const yaml = `
- id: fiscal-year
  kind: context
  content: 'Fiscal year starts in February.'
  global: true
`;
        expect(loadProjectContextFile(yaml)[0]).not.toHaveProperty('global');
    });

    test('returns an empty array for empty content', () => {
        expect(loadProjectContextFile('')).toEqual([]);
        expect(loadProjectContextFile('   \n  ')).toEqual([]);
    });

    test('throws when the top level is not a list', () => {
        expect(() => loadProjectContextFile('id: foo')).toThrow(ParseError);
    });

    test('throws when an entry is missing required fields', () => {
        const yaml = `
- id: broken
  kind: definition
- id: ok
  kind: definition
  content: 'a valid fact'
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });

    test('throws when an entry kind is not a known value', () => {
        const yaml = `
- id: broken
  kind: nonsense
  content: 'whatever'
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });

    test('derives an id from the first term when absent', () => {
        const yaml = `
- kind: definition
  content: '"HR" = high-risk cohort.'
  terms: [HR, high risk]
`;
        expect(loadProjectContextFile(yaml)[0].id).toBe('hr');
    });

    test('suffixes derived ids to keep them unique within the file', () => {
        const yaml = `
- kind: definition
  content: first
  terms: [HR]
- kind: definition
  content: second
  terms: [HR]
`;
        expect(loadProjectContextFile(yaml).map((e) => e.id)).toEqual([
            'hr',
            'hr-1',
        ]);
    });

    test('preserves unknown keys (passthrough) so future fields round-trip', () => {
        const yaml = `
- id: hr
  kind: definition
  content: x
  priority: high
`;
        expect(loadProjectContextFile(yaml)[0]).toMatchObject({
            id: 'hr',
            priority: 'high',
        });
    });
});

describe('mergeProjectContextEntry', () => {
    test('creates a new entry with an id derived from the first term', () => {
        const result = mergeProjectContextEntry([], {
            op: 'create',
            id: null,
            kind: 'definition',
            content: '"HR" = high-risk cohort.',
            terms: ['HR'],
            objects: [],
        });
        expect(result.op).toBe('create');
        expect(result.entryId).toBe('hr');
        expect(result.entries).toEqual([
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ]);
    });

    test('creates with an explicit id when provided', () => {
        const result = mergeProjectContextEntry([], {
            op: 'create',
            id: 'patient-routing',
            kind: 'context',
            content: 'Attribute payments via customer_order_payments.',
            terms: [],
            objects: ['payments'],
        });
        expect(result.entryId).toBe('patient-routing');
        expect(result.entries).toHaveLength(1);
    });

    test('updates an existing entry by id', () => {
        const existing = entry({
            id: 'fiscal',
            kind: 'context',
            content: 'old',
        });
        const result = mergeProjectContextEntry([existing], {
            op: 'update',
            id: 'fiscal',
            kind: 'context',
            content: 'Fiscal year starts in February.',
            terms: [],
            objects: [],
        });
        expect(result.op).toBe('update');
        expect(result.entries).toEqual([
            {
                id: 'fiscal',
                kind: 'context',
                content: 'Fiscal year starts in February.',
                terms: [],
                objects: [],
            },
        ]);
    });

    test('rejects an update without an id', () => {
        expect(() =>
            mergeProjectContextEntry([], {
                op: 'update',
                id: null,
                kind: 'context',
                content: 'Fiscal year starts in February.',
                terms: [],
                objects: [],
            }),
        ).toThrow('requires an entry id');
    });

    test('suffixes a generated id that collides with an existing one', () => {
        const result = mergeProjectContextEntry([entry({ id: 'hr' })], {
            op: 'create',
            id: null,
            kind: 'definition',
            content: 'another HR meaning',
            terms: ['HR'],
            objects: [],
        });
        expect(result.entryId).toBe('hr-1');
        expect(result.entries).toHaveLength(2);
    });

    test('treats a create whose explicit id already exists as an update (dedup)', () => {
        const result = mergeProjectContextEntry([entry({ id: 'hr' })], {
            op: 'create',
            id: 'hr',
            kind: 'definition',
            content: 'replaced',
            terms: [],
            objects: [],
        });
        expect(result.op).toBe('update');
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0].content).toBe('replaced');
    });
});

describe('serializeProjectContextFile', () => {
    test('round-trips through the parser', () => {
        const entries = [
            entry({
                id: 'hr',
                kind: 'definition',
                content: 'x',
                terms: ['HR'],
            }),
            entry({ id: 'fy', kind: 'context', content: 'y' }),
        ];
        expect(
            loadProjectContextFile(serializeProjectContextFile(entries)),
        ).toEqual(entries);
    });

    test('produces an empty list for no entries', () => {
        expect(loadProjectContextFile(serializeProjectContextFile([]))).toEqual(
            [],
        );
    });

    test('serializes to a versioned { version, entries } document', () => {
        const output = serializeProjectContextFile([
            entry({ id: 'hr', kind: 'definition', content: 'x' }),
        ]);
        expect(output).toContain('version: 1');
        expect(output).toContain('entries:');
    });

    test('parses the versioned { version, entries } shape', () => {
        const yaml = `
version: 1
entries:
  - id: hr
    kind: definition
    content: '"HR" = high-risk cohort.'
    terms: [HR]
`;
        expect(loadProjectContextFile(yaml)).toEqual([
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ]);
    });

    test('throws on unsupported document versions', () => {
        const yaml = `
version: 2
entries:
  - id: hr
    kind: definition
    content: '"HR" = high-risk cohort.'
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });
});
