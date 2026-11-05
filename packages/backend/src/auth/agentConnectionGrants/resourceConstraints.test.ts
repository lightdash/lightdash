import { AgentCapability } from '@lightdash/common';
import { evaluateGrant } from './evaluateGrant';
import { grantFixture, projectGrantFixture } from './grant.mock';
import { parseGrantResourceConstraints } from './resourceConstraints';

describe.each([1, 2])('version %i approval lists', (version) => {
    const makeGrant = () =>
        version === 1 ? grantFixture() : projectGrantFixture();

    it.each([
        [
            'null project element',
            {
                approvedProjectUuids: [
                    grantFixture().approvedProjectUuids[0],
                    null,
                ],
            },
        ],
        [
            'non-uuid project element',
            {
                approvedProjectUuids: [
                    grantFixture().approvedProjectUuids[0],
                    'project',
                ],
            },
        ],
        ['null project list', { approvedProjectUuids: null }],
        [
            'string project list',
            { approvedProjectUuids: grantFixture().approvedProjectUuids[0] },
        ],
        ['object project list', { approvedProjectUuids: {} }],
        ['missing project list', { approvedProjectUuids: undefined }],
        ['null capability list', { approvedCapabilities: null }],
        [
            'string capability list',
            { approvedCapabilities: AgentCapability.Query },
        ],
        ['object capability list', { approvedCapabilities: {} }],
        ['missing capability list', { approvedCapabilities: undefined }],
        ['null capability element', { approvedCapabilities: [null] }],
        ['unknown capability', { approvedCapabilities: ['unknown'] }],
    ])(
        'refuses %s in parsing and enforcement without throwing',
        (_name, approval) => {
            const grant = Object.assign(makeGrant(), approval);
            expect(parseGrantResourceConstraints(grant)).toBeNull();
            expect(
                evaluateGrant({
                    grant,
                    kind: 'rest',
                    key: 'ProjectController.getAllExplores',
                    projectUuids: [grantFixture().approvedProjectUuids[0]],
                    now: new Date(),
                }),
            ).toBe('This agent connection has an unsupported grant contract.');
        },
    );

    it('preserves readable limits without mutating the grant', () => {
        const grant = makeGrant();
        const before = structuredClone(grant);
        expect(parseGrantResourceConstraints(grant)).toEqual(
            grant.resourceConstraints,
        );
        expect(grant).toEqual(before);
    });

    it('preserves the existing duplicate approval rule', () => {
        const grant = makeGrant();
        grant.approvedProjectUuids.push(grant.approvedProjectUuids[0]);
        grant.approvedCapabilities.push(grant.approvedCapabilities[0]);
        expect(parseGrantResourceConstraints(grant)).toEqual(
            version === 1 ? { version: 1 } : null,
        );
    });
});
