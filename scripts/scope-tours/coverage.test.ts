import { getTrainingProjectScopes } from '@lightdash/common';
import * as assert from 'assert';
import { SCOPE_TOURS } from '../../packages/frontend/src/features/scopeTours/generated';
import {
    auditCoverage,
    SCOPE_DISPOSITIONS,
    type ScopeDisposition,
} from './coverage';

const pending: ScopeDisposition = {
    status: 'pending',
    reason: 'Needs a supported lesson format.',
    ticket: 'CS-212',
    tour: null,
};
const related: ScopeDisposition = {
    ...pending,
    status: 'related',
    tour: 'create:VirtualView',
};

assert.deepStrictEqual(
    auditCoverage(['view:Thing@self'], [], {}).unclassified,
    [],
);
assert.strictEqual(auditCoverage(['view:NewFeature'], [], {}).ok, false);
assert.deepStrictEqual(
    auditCoverage(['view:NewFeature'], [], {}).unclassified,
    ['view:NewFeature'],
);
assert.strictEqual(
    auditCoverage(['manage:VirtualView'], [], { 'manage:VirtualView': related })
        .ok,
    false,
);
assert.deepStrictEqual(
    auditCoverage(['manage:VirtualView'], [], { 'manage:VirtualView': related })
        .missingTours,
    [{ scope: 'manage:VirtualView', tour: 'create:VirtualView' }],
);
const incomplete = auditCoverage(
    ['create:VirtualView', 'manage:VirtualView', 'view:EmbedExplore'],
    ['create:VirtualView'],
    { 'manage:VirtualView': related, 'view:EmbedExplore': pending },
);
assert.strictEqual(incomplete.ok, true);
assert.deepStrictEqual(incomplete.generated, ['create:VirtualView']);
assert.deepStrictEqual(incomplete.related, ['manage:VirtualView']);
assert.deepStrictEqual(incomplete.pending, ['view:EmbedExplore']);
assert.strictEqual(
    auditCoverage(
        ['manage:VirtualView'],
        ['create:VirtualView'],
        { 'manage:VirtualView': related },
        true,
    ).ok,
    false,
);
assert.strictEqual(
    auditCoverage(
        ['view:EmbedExplore'],
        [],
        { 'view:EmbedExplore': pending },
        true,
    ).ok,
    false,
);
assert.deepStrictEqual(
    auditCoverage([], [], { 'view:Removed': pending }).staleDispositions,
    ['view:Removed'],
);
assert.strictEqual(
    auditCoverage(['view:Done'], ['view:Done'], { 'view:Done': pending }).ok,
    false,
);
assert.strictEqual(
    auditCoverage(['view:MissingReason'], [], {
        'view:MissingReason': { ...pending, reason: ' ' },
    }).ok,
    false,
);
assert.strictEqual(
    auditCoverage(['view:MissingTicket'], [], {
        'view:MissingTicket': { ...pending, ticket: '' },
    }).ok,
    false,
);
assert.strictEqual(
    auditCoverage(['view:Related'], [], {
        'view:Related': { ...related, tour: null },
    }).ok,
    false,
);
assert.strictEqual(
    auditCoverage(
        ['view:Internal'],
        [],
        { 'view:Internal': { ...pending, status: 'excluded' } },
        true,
    ).ok,
    true,
);

const actual = auditCoverage(
    getTrainingProjectScopes(),
    Object.keys(SCOPE_TOURS),
    SCOPE_DISPOSITIONS,
);
assert.strictEqual(actual.ok, true, JSON.stringify(actual, null, 2));
assert.strictEqual(actual.unclassified.length, 0);
console.log('scope coverage: all checks passed');
