import { ParseError } from '../../types/errors';
import {
    applyProjectContextWriteback,
    buildProjectContextEntrySlug,
    formatAiProjectContextObjectRef,
    loadProjectContextFile,
    mergeProjectContextEntry,
    normalizeProjectContextEntryContent,
    parseProjectContextEntrySlugHash8,
    PROJECT_CONTEXT_FILE_HEADER,
    projectContextEntrySchema,
    serializeAiProjectContextObjectRef,
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

describe('legacy object refs', () => {
    test('remain readable in persisted project context entries', () => {
        const parsed = projectContextEntrySchema.parse({
            id: 'legacy',
            kind: 'context',
            content: 'Use orders.',
            terms: [],
            objects: ['orders'],
        });

        expect(parsed.objects).toEqual(['orders']);
        expect(serializeAiProjectContextObjectRef(parsed.objects[0])).toBe(
            'orders',
        );
        expect(formatAiProjectContextObjectRef(parsed.objects[0])).toBe(
            'orders',
        );
    });
});

describe('loadProjectContextFile', () => {
    test('parses a fully-specified entry', () => {
        const yaml = `
- id: hr-abbreviation
  kind: definition
  content: '"HR" = the high-risk diabetes cohort, not human resources.'
  terms: [HR, high risk]
  objects:
    - type: field
      explore: patient_health_scores
      fieldId: patient_health_scores_diabetes_risk_category
`;
        expect(loadProjectContextFile(yaml)).toEqual([
            {
                id: 'hr-abbreviation',
                kind: 'definition',
                content:
                    '"HR" = the high-risk diabetes cohort, not human resources.',
                terms: ['HR', 'high risk'],
                objects: [
                    {
                        type: 'field',
                        explore: 'patient_health_scores',
                        fieldId: 'patient_health_scores_diabetes_risk_category',
                    },
                ],
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

    test('rejects legacy string object refs in v2 files', () => {
        const yaml = `
version: 2
entries:
  - id: routing
    kind: context
    content: Use payments.
    objects: [payments]
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });

    test('drops invalid object refs from quoted v1 documents', () => {
        const yaml = `
version: "1"
entries:
  - id: routing
    kind: context
    content: Use payments.
    objects: [payments]
`;
        expect(loadProjectContextFile(yaml)).toEqual([
            {
                id: 'routing',
                kind: 'context',
                content: 'Use payments.',
                terms: [],
                objects: [],
            },
        ]);
    });

    test('drops the whole legacy objects array when any ref is invalid', () => {
        const yaml = `
version: 1
entries:
  - id: routing
    kind: context
    content: Use payments.
    objects:
      - type: explore
        name: payments
      - orders
`;
        expect(loadProjectContextFile(yaml)[0].objects).toEqual([]);
    });

    test('preserves valid typed object refs in v1 documents', () => {
        const yaml = `
version: 1
entries:
  - id: routing
    kind: context
    content: Use payments.
    objects:
      - type: explore
        name: payments
`;
        expect(loadProjectContextFile(yaml)[0].objects).toEqual([
            { type: 'explore', name: 'payments' },
        ]);
    });

    test('still rejects invalid non-object fields in v1 documents', () => {
        const yaml = `
version: 1
entries:
  - id: routing
    kind: unknown
    content: Use payments.
    objects: [payments]
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });

    test('drops invalid object refs from legacy bare arrays', () => {
        const yaml = `
- id: routing
  kind: context
  content: Use payments.
  objects: [payments]
`;
        expect(loadProjectContextFile(yaml)[0].objects).toEqual([]);
    });

    test.each([
        [
            'v1 documents',
            `version: 1
entries:
  - id: routing
    kind: context
    content: Use payments.
    objects:
`,
        ],
        [
            'legacy bare arrays',
            `- id: routing
  kind: context
  content: Use payments.
  objects:
`,
        ],
    ])('drops null objects from %s', (_, yaml) => {
        expect(loadProjectContextFile(yaml)[0].objects).toEqual([]);
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
            title: null,
            apply: null,
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
            title: null,
            apply: null,
            id: 'patient-routing',
            kind: 'context',
            content: 'Attribute payments via customer_order_payments.',
            terms: [],
            objects: [{ type: 'explore', name: 'payments' }],
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
            title: null,
            apply: null,
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
                title: null,
                apply: null,
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
            title: null,
            apply: null,
            id: null,
            kind: 'definition',
            content: 'another HR meaning',
            terms: ['HR'],
            objects: [],
        });
        expect(result.entryId).toBe('hr-1');
        expect(result.entries).toHaveLength(2);
    });

    test('an update with null title/apply preserves the existing values', () => {
        const existing = entry({
            id: 'hr',
            content: 'old',
            title: 'HR means high-risk cohort',
            apply: 'When a question mentions HR.',
        });
        const result = mergeProjectContextEntry([existing], {
            op: 'update',
            title: null,
            apply: null,
            id: 'hr',
            kind: 'context',
            content: 'new content',
            terms: [],
            objects: [],
        });
        expect(result.entries[0]).toMatchObject({
            content: 'new content',
            title: 'HR means high-risk cohort',
            apply: 'When a question mentions HR.',
        });
        expect(result.entry).toEqual(result.entries[0]);
    });

    test('an update with explicit title/apply overrides the existing values', () => {
        const existing = entry({
            id: 'hr',
            content: 'old',
            title: 'Old title',
            apply: 'Old apply',
        });
        const result = mergeProjectContextEntry([existing], {
            op: 'update',
            title: 'New title',
            apply: 'New apply',
            id: 'hr',
            kind: 'context',
            content: 'new content',
            terms: [],
            objects: [],
        });
        expect(result.entries[0]).toMatchObject({
            title: 'New title',
            apply: 'New apply',
        });
    });

    test('treats a create whose explicit id already exists as an update (dedup)', () => {
        const result = mergeProjectContextEntry([entry({ id: 'hr' })], {
            op: 'create',
            title: null,
            apply: null,
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

    test('prepends a self-documenting header, ignored by the parser', () => {
        const output = serializeProjectContextFile([
            entry({ id: 'hr', kind: 'definition', content: 'x' }),
        ]);
        expect(output.startsWith(PROJECT_CONTEXT_FILE_HEADER)).toBe(true);
        // the header is a comment, so loading round-trips to just the entry
        expect(loadProjectContextFile(output)).toEqual([
            entry({ id: 'hr', kind: 'definition', content: 'x' }),
        ]);
    });

    test('omits the header when there are no entries', () => {
        expect(serializeProjectContextFile([])).toBe('');
    });

    test('serializes to a versioned { version, entries } document', () => {
        const output = serializeProjectContextFile([
            entry({ id: 'hr', kind: 'definition', content: 'x' }),
        ]);
        expect(output).toContain('version: 2');
        expect(output).toContain('entries:');
    });

    test('parses the versioned { version, entries } shape', () => {
        const yaml = `
version: 2
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

    test('rejects unsupported document versions', () => {
        const yaml = `
version: 3
entries:
  - id: hr
    kind: definition
    content: '"HR" = high-risk cohort.'
`;
        expect(() => loadProjectContextFile(yaml)).toThrow(ParseError);
    });
});

describe('applyProjectContextWriteback', () => {
    test('upgrades v1 files and drops invalid object refs', () => {
        const existing = `version: "1"
entries:
  - id: legacy
    kind: context
    content: Use orders.
    objects: [orders]
`;
        const { content, upgradesFileToV2 } = applyProjectContextWriteback(
            existing,
            {
                op: 'create',
                title: null,
                apply: null,
                id: 'payments',
                kind: 'context',
                content: 'Use payments.',
                terms: [],
                objects: [{ type: 'explore', name: 'payments' }],
            },
        );

        expect(upgradesFileToV2).toBe(true);
        expect(content).toContain('version: 2');
        expect(loadProjectContextFile(content)).toEqual([
            {
                id: 'legacy',
                kind: 'context',
                content: 'Use orders.',
                terms: [],
                objects: [],
            },
            {
                id: 'payments',
                kind: 'context',
                content: 'Use payments.',
                terms: [],
                objects: [{ type: 'explore', name: 'payments' }],
            },
        ]);
    });

    test('creates a canonical file from empty content', () => {
        const { content, entryId, op, upgradesFileToV2 } =
            applyProjectContextWriteback('', {
                op: 'create',
                title: null,
                apply: null,
                id: null,
                kind: 'definition',
                content: 'MRR means monthly recurring revenue.',
                terms: ['MRR'],
                objects: [],
            });
        expect(op).toBe('create');
        expect(entryId).toBe('mrr');
        expect(content).toContain('version: 2');
        expect(upgradesFileToV2).toBe(false);
        expect(content.startsWith(PROJECT_CONTEXT_FILE_HEADER)).toBe(true);
        expect(loadProjectContextFile(content)).toEqual([
            {
                id: 'mrr',
                kind: 'definition',
                content: 'MRR means monthly recurring revenue.',
                terms: ['MRR'],
                objects: [],
            },
        ]);
    });

    test('keeps the header when a later writeback edits the generated file', () => {
        const firstWrite = applyProjectContextWriteback('', {
            op: 'create',
            title: null,
            apply: null,
            id: null,
            kind: 'definition',
            content: 'MRR means monthly recurring revenue.',
            terms: ['MRR'],
            objects: [],
        });
        const secondWrite = applyProjectContextWriteback(firstWrite.content, {
            op: 'create',
            title: null,
            apply: null,
            id: null,
            kind: 'definition',
            content: 'ARR means annual recurring revenue.',
            terms: ['ARR'],
            objects: [],
        });
        expect(secondWrite.content).toContain(
            'What your AI agents read before they answer.',
        );
        expect(loadProjectContextFile(secondWrite.content)).toHaveLength(2);
    });

    test('appends a new entry, preserving existing comments and entries verbatim', () => {
        const existing = `version: 2
entries:
  # Curated by the data team — do not reorder.
  - id: hr
    kind: definition
    content: '"HR" = high-risk cohort.'
    terms: [HR]
    objects: []
`;
        const { content, op, upgradesFileToV2 } = applyProjectContextWriteback(
            existing,
            {
                op: 'create',
                title: null,
                apply: null,
                id: null,
                kind: 'definition',
                content: 'MRR means monthly recurring revenue.',
                terms: ['MRR'],
                objects: [],
            },
        );
        expect(op).toBe('create');
        expect(upgradesFileToV2).toBe(false);
        // The human comment, the original quoting, the flow style and the entry
        // content all survive byte-for-byte — this is the whole point: a minimal,
        // reviewable diff (just the added entry) rather than a full-file rewrite.
        expect(content).toContain('# Curated by the data team');
        expect(content).toContain(`content: '"HR" = high-risk cohort.'`);
        expect(content).toContain('terms: [HR]');
        expect(content).toContain('id: mrr');
        expect(loadProjectContextFile(content)).toHaveLength(2);
    });

    test('updates an existing entry in place by id', () => {
        const existing = `version: 2
entries:
  - id: mrr
    kind: definition
    content: old
    terms: [MRR]
    objects: []
`;
        const { content, entryId, op } = applyProjectContextWriteback(
            existing,
            {
                op: 'update',
                title: null,
                apply: null,
                id: 'mrr',
                kind: 'definition',
                content: 'MRR means monthly recurring revenue.',
                terms: ['MRR'],
                objects: [],
            },
        );
        expect(op).toBe('update');
        expect(entryId).toBe('mrr');
        const entries = loadProjectContextFile(content);
        expect(entries).toHaveLength(1);
        expect(entries[0].content).toBe('MRR means monthly recurring revenue.');
    });

    test('an in-place update with null title/apply keeps the generated fields', () => {
        const existing = `version: 2
entries:
  - id: mrr
    kind: definition
    content: old
    terms: [MRR]
    objects: []
    title: MRR means monthly recurring revenue
    apply: When a question mentions MRR.
`;
        const { content } = applyProjectContextWriteback(existing, {
            op: 'update',
            title: null,
            apply: null,
            id: 'mrr',
            kind: 'definition',
            content: 'refined content',
            terms: ['MRR'],
            objects: [],
        });
        const entries = loadProjectContextFile(content);
        expect(entries[0]).toMatchObject({
            content: 'refined content',
            title: 'MRR means monthly recurring revenue',
            apply: 'When a question mentions MRR.',
        });
    });
});

describe('durable identity helpers', () => {
    test('normalize trims and collapses internal whitespace', () => {
        expect(normalizeProjectContextEntryContent('  a\n  b\t c  ')).toBe(
            'a b c',
        );
    });

    test('slug is the id truncated to 40 chars plus the hash8', () => {
        const hash = '3fa9c2d1'.padEnd(64, '0');
        expect(buildProjectContextEntrySlug('revenue-definition', hash)).toBe(
            'revenue-definition-3fa9c2d1',
        );
        const longId = 'x'.repeat(60);
        expect(buildProjectContextEntrySlug(longId, hash)).toBe(
            `${'x'.repeat(40)}-3fa9c2d1`,
        );
        // A truncation ending on a hyphen does not double up.
        expect(
            buildProjectContextEntrySlug(`${'x'.repeat(39)}-suffix`, hash),
        ).toBe(`${'x'.repeat(39)}-3fa9c2d1`);
    });

    test('slug kebab-izes non-kebab ids to satisfy the citation grammar', () => {
        const hash = '3fa9c2d1'.padEnd(64, '0');
        expect(buildProjectContextEntrySlug('Revenue_Goal', hash)).toBe(
            'revenue-goal-3fa9c2d1',
        );
        expect(buildProjectContextEntrySlug('HR abbreviation!', hash)).toBe(
            'hr-abbreviation-3fa9c2d1',
        );
        // An id with no slug-safe chars degrades to the bare hash8.
        expect(buildProjectContextEntrySlug('***', hash)).toBe('3fa9c2d1');
    });

    test('slug resolution parses the trailing hash8 only', () => {
        expect(
            parseProjectContextEntrySlugHash8('revenue-definition-3fa9c2d1'),
        ).toBe('3fa9c2d1');
        expect(parseProjectContextEntrySlugHash8('3fa9c2d1')).toBe('3fa9c2d1');
        expect(parseProjectContextEntrySlugHash8('no-hash-here')).toBeNull();
        expect(parseProjectContextEntrySlugHash8('short-3fa9')).toBeNull();
        expect(parseProjectContextEntrySlugHash8('')).toBeNull();
    });
});

describe('title and apply fields', () => {
    test('round-trip through load and serialize', () => {
        const entries = loadProjectContextFile(
            [
                'version: 2',
                'entries:',
                '  - id: hr',
                '    kind: definition',
                '    content: HR means the high-risk cohort.',
                '    title: HR means high-risk cohort',
                '    apply: When a question mentions HR.',
            ].join('\n'),
        );
        expect(entries[0].title).toBe('HR means high-risk cohort');
        expect(entries[0].apply).toBe('When a question mentions HR.');
        const reloaded = loadProjectContextFile(
            serializeProjectContextFile(entries),
        );
        expect(reloaded[0].title).toBe('HR means high-risk cohort');
        expect(reloaded[0].apply).toBe('When a question mentions HR.');
    });

    test('writeback includes title and apply only when present', () => {
        const withFields = applyProjectContextWriteback('', {
            op: 'create',
            id: null,
            kind: 'definition',
            content: '"HR" = high-risk cohort.',
            terms: ['HR'],
            objects: [],
            title: 'HR means high-risk cohort',
            apply: 'When a question mentions HR.',
        });
        expect(withFields.content).toContain(
            'title: HR means high-risk cohort',
        );
        expect(withFields.content).toContain(
            'apply: When a question mentions HR.',
        );

        const withoutFields = applyProjectContextWriteback('', {
            op: 'create',
            id: null,
            kind: 'definition',
            content: '"HR" = high-risk cohort.',
            terms: ['HR'],
            objects: [],
            title: null,
            apply: null,
        });
        expect(withoutFields.content).not.toContain('title:');
        expect(withoutFields.content).not.toContain('apply:');
    });
});
