import {
    buildRoadmapItem,
    LinearWorkflowStateType,
    mapLinearStateToRoadmapStatus,
    PUBLIC_ROADMAP_LINK_PREFIX,
    redactRoadmapItems,
    ROADMAP_FORBIDDEN_FIELDS,
    ROADMAP_ITEM_ALLOWED_FIELDS,
    RoadmapItemStatus,
    type RoadmapItem,
} from './roadmap';

/**
 * Contract tests for the roadmap curation boundary (CS-20). These assert the
 * two GA-gating invariants from the project design:
 *
 * 1. Byte-for-byte: what a customer is served is exactly the curated dataset —
 *    the full curate → store → redact chain is deterministic and reproducible.
 * 2. Fail closed: no input, however malformed or adversarial, can push
 *    anything beyond the allowlisted public fields across the boundary.
 */

const ALLOWED = [...ROADMAP_ITEM_ALLOWED_FIELDS] as string[];

/** Simulate the storage roundtrip: stored rows are plain JSON objects. */
const throughStore = (item: RoadmapItem): Record<string, unknown> =>
    JSON.parse(JSON.stringify(item));

describe('roadmap contract: byte-for-byte serving', () => {
    it('curate -> store -> redact serves exactly the curated JSON', () => {
        const rawLinearIssues = [
            {
                title: 'Dark mode',
                description: 'Please add dark mode',
                state: { name: 'In Progress', type: 'started' },
                issueUrl: 'https://github.com/lightdash/lightdash/issues/1',
                pullRequestUrl: 'https://github.com/lightdash/lightdash/pull/2',
            },
            {
                title: 'Unicode — emoji 🚀 and quotes "double" \'single\'',
                description: null,
                state: { name: 'Todo', type: 'unstarted' },
                issueUrl: 'https://github.com/lightdash/lightdash/issues/3',
                pullRequestUrl: null,
            },
        ];

        const curated = rawLinearIssues.map(buildRoadmapItem);
        const stored = curated.map(throughStore);
        const served = redactRoadmapItems(stored);

        expect(served.rejected).toEqual([]);
        // Byte-for-byte: serialization of served items equals serialization
        // of the curated dataset.
        expect(JSON.stringify(served.items)).toBe(JSON.stringify(curated));
    });

    it('redaction is idempotent: redacting served output changes nothing', () => {
        const item = buildRoadmapItem({
            title: 'Stable',
            description: 'body',
            state: { name: 'Done', type: 'completed' },
            issueUrl: 'https://github.com/lightdash/lightdash/issues/9',
        });
        const once = redactRoadmapItems([throughStore(item)]);
        const twice = redactRoadmapItems(once.items.map(throughStore));
        expect(JSON.stringify(twice.items)).toBe(JSON.stringify(once.items));
        expect(twice.rejected).toEqual([]);
    });
});

describe('roadmap contract: fail closed on adversarial input', () => {
    const validBase = {
        title: 'Legit request',
        description: null,
        status: RoadmapItemStatus.BACKLOG,
        issueUrl: null,
        pullRequestUrl: null,
    };

    const adversarialInputs: Array<Record<string, unknown>> = [
        // extra unknown fields at every position
        { ...validBase, id: 'uuid', sortOrder: 1, __proto__pollution: true },
        // nested objects trying to smuggle data through allowed keys' siblings
        { ...validBase, customerContext: { name: 'Acme Corp', arr: 100000 } },
        // internal links in the link fields
        {
            ...validBase,
            issueUrl: 'https://linear.app/lightdash/issue/PROD-1',
            pullRequestUrl: 'https://app.usepylon.com/issues?issueNumber=1',
        },
        // wrong types everywhere
        { title: ['array'], description: 7, status: {}, issueUrl: 1 },
        // empty object
        {},
        // allowed keys only but invalid status casing
        { ...validBase, status: 'backlog' },
    ];

    it.each(adversarialInputs.map((input, i) => [i, input]))(
        'input %#: served output never exceeds the allowlist',
        (_i, input) => {
            const { items } = redactRoadmapItems([
                input as Record<string, unknown>,
            ]);
            items.forEach((item) => {
                // every key served is allowlisted…
                Object.keys(item).forEach((key) =>
                    expect(ALLOWED).toContain(key),
                );
                // …and no known-internal field name survives serialization
                const json = JSON.stringify(item);
                ROADMAP_FORBIDDEN_FIELDS.forEach((field) =>
                    expect(json).not.toContain(`"${field}"`),
                );
                // links, when present, point at the public repo only —
                // a bare github.com prefix would admit private repos
                [item.issueUrl, item.pullRequestUrl].forEach((url) => {
                    if (url !== null) {
                        expect(url.startsWith(PUBLIC_ROADMAP_LINK_PREFIX)).toBe(
                            true,
                        );
                    }
                });
            });
        },
    );

    it('a whole batch of garbage serves an empty list, never throws', () => {
        const garbage = [
            null,
            undefined,
            42,
            'string',
            [],
        ] as unknown as ReadonlyArray<Record<string, unknown>>;
        expect(() => redactRoadmapItems(garbage)).not.toThrow();
        expect(redactRoadmapItems(garbage).items).toEqual([]);
    });

    it('serves an empty list for an empty mirror', () => {
        const result = redactRoadmapItems([]);
        expect(result.items).toEqual([]);
        expect(result.rejected).toEqual([]);
    });
});

describe('roadmap contract: status mapping is total over Linear state types', () => {
    it.each(Object.values(LinearWorkflowStateType))(
        'canonical Linear state type "%s" maps to a customer-facing status',
        (type) => {
            const mapped = mapLinearStateToRoadmapStatus({
                name: 'Renamed By A Team',
                type,
            });
            expect(mapped).not.toBeNull();
            expect(Object.values(RoadmapItemStatus)).toContain(mapped);
        },
    );

    it('unknown states are excluded end-to-end, never mislabelled', () => {
        expect(() =>
            buildRoadmapItem({
                title: 'Mystery',
                description: null,
                state: { name: 'Someday', type: 'someday' },
            }),
        ).toThrow();
        // and at the serving boundary an invalid stored status is withheld
        const { items, rejected } = redactRoadmapItems([
            {
                title: 'Mystery',
                description: null,
                status: 'Someday',
                issueUrl: null,
                pullRequestUrl: null,
            },
        ]);
        expect(items).toEqual([]);
        expect(rejected).toHaveLength(1);
    });
});
