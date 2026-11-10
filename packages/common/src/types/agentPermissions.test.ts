import {
    AGENT_CAPABILITY_DEFAULTS,
    AGENT_CAPABILITY_DEFINITIONS,
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    AgentCapability,
    getAgentCapabilityName,
} from './agentPermissions';

const expectedNames: Record<AgentCapability, [string, string]> = {
    [AgentCapability.ReadDiscover]: ['Read', 'Read and discover'],
    [AgentCapability.Query]: ['Query', 'Query data'],
    [AgentCapability.RawSql]: ['Raw SQL', 'Raw SQL'],
    [AgentCapability.ContentWrite]: [
        'Create / edit',
        'Create and edit content',
    ],
    [AgentCapability.Delete]: ['Delete', 'Delete content'],
    [AgentCapability.Publish]: ['Publish', 'Publish and share'],
    [AgentCapability.DeployUpload]: ['Deploy', 'Deploy and upload'],
    [AgentCapability.DbtWriteback]: ['dbt', 'Git repository changes (dbt)'],
    [AgentCapability.Export]: ['Export', 'Export results'],
    [AgentCapability.Administration]: ['Admin', 'Administration'],
    [AgentCapability.ExternalTools]: ['External tools', 'External tools'],
};

test('defines exactly the current capabilities', () => {
    expect(Object.keys(AGENT_CAPABILITY_DEFINITIONS).sort()).toEqual(
        Object.values(AgentCapability).sort(),
    );
});

test.each(Object.values(AgentCapability))(
    'defines plain copy for %s',
    (capability) => {
        const definition = AGENT_CAPABILITY_DEFINITIONS[capability];
        expect(definition.capability).toBe(capability);
        expect([definition.shortName, definition.name]).toEqual(
            expectedNames[capability],
        );
        expect(getAgentCapabilityName(capability)).toBe(
            expectedNames[capability][1],
        );
        expect(definition.examples.length).toBeGreaterThan(0);
        const strings = [
            definition.shortName,
            definition.name,
            definition.allows,
            ...definition.examples,
        ];
        for (const value of strings) {
            expect(value.trim()).not.toBe('');
            expect(value).not.toMatch(
                /ceiling|pilot|managed mode|AI service account/i,
            );
            for (const rawKey of Object.values(AgentCapability).filter((key) =>
                key.includes('_'),
            )) {
                expect(value).not.toContain(rawKey);
            }
        }
    },
);

test('policy limits start with all eleven capabilities without changing custom role defaults', () => {
    expect(AGENT_CAPABILITY_LIMIT_DEFAULTS).toEqual(
        Object.values(AgentCapability),
    );
    expect(AGENT_CAPABILITY_LIMIT_DEFAULTS).toHaveLength(11);
    expect(AGENT_CAPABILITY_DEFAULTS).toEqual([
        AgentCapability.ReadDiscover,
        AgentCapability.Query,
        AgentCapability.Export,
        AgentCapability.RawSql,
    ]);
});
