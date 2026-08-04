import { computeAutopilotExcludedSpaceUuids } from './managedAgent';

const space = (
    uuid: string,
    parentSpaceUuid: string | null = null,
    slug: string = `space-${uuid}`,
) => ({ uuid, parentSpaceUuid, slug });

describe('computeAutopilotExcludedSpaceUuids', () => {
    const spaces = [
        space('ops'),
        space('reporting'),
        space('playground'),
        space('playground-child', 'playground'),
        space('playground-grandchild', 'playground-child'),
        space('agent', null, 'agent-suggestions'),
    ];

    it('excludes nothing by default in all-except mode', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'all-except', []),
        ).toEqual(new Set());
    });

    it('excludes selected spaces and their subtree in all-except mode', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'all-except', [
                'playground',
            ]),
        ).toEqual(
            new Set([
                'playground',
                'playground-child',
                'playground-grandchild',
            ]),
        );
    });

    it('excludes everything not selected in only mode', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'only', ['ops']),
        ).toEqual(
            new Set([
                'reporting',
                'playground',
                'playground-child',
                'playground-grandchild',
            ]),
        );
    });

    it('includes the subtree of allowlisted spaces in only mode', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'only', ['playground']),
        ).toEqual(new Set(['ops', 'reporting']));
    });

    it('never excludes the Agent Suggestions space', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'only', ['ops']).has(
                'agent',
            ),
        ).toBe(false);
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'all-except', ['agent']),
        ).toEqual(new Set());
    });

    it('handles unknown selected uuids without exploding', () => {
        expect(
            computeAutopilotExcludedSpaceUuids(spaces, 'all-except', [
                'does-not-exist',
            ]),
        ).toEqual(new Set(['does-not-exist']));
    });
});
