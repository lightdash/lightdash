import { AGENT_ACCESS_PREVIEW_ACTIONS } from './agentAccessPreviewActions';
import {
    AGENT_CAPABILITY_DEFINITIONS,
    AgentCapability,
} from './agentPermissions';

test('lists each capability once with its plain name', () => {
    expect(
        AGENT_ACCESS_PREVIEW_ACTIONS.filter(
            ({ group }) => group === 'capability',
        ),
    ).toEqual(
        Object.values(AGENT_CAPABILITY_DEFINITIONS).map(
            ({ capability, name, allows }) => ({
                id: `capability:${capability}`,
                label: name,
                description: allows,
                group: 'capability',
            }),
        ),
    );
    expect(new Set(AGENT_ACCESS_PREVIEW_ACTIONS.map(({ id }) => id)).size).toBe(
        AGENT_ACCESS_PREVIEW_ACTIONS.length,
    );
    expect(
        AGENT_ACCESS_PREVIEW_ACTIONS.filter(
            ({ group }) => group === 'operation',
        ).map(({ label }) => label),
    ).toEqual([
        'Run raw SQL',
        'Schedule a delivery',
        'Export results',
        'Create or edit a chart',
        'Delete content',
        'Publish a dashboard',
        'Change dbt files',
        'Run a saved SQL chart',
        'Delete a repository file',
        'Change agent permissions',
    ]);
    for (const { label } of AGENT_ACCESS_PREVIEW_ACTIONS) {
        expect(label).not.toMatch(/_|Controller|capability:/);
        expect(Object.values(AgentCapability)).not.toContain(label);
    }
});
