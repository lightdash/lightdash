import { BuiltInSkills } from './builtInSkills';

describe('BuiltInSkills', () => {
    const artifactSkill = 'mcp-artifact-integration';
    const artifactUri = `skill://lightdash/${artifactSkill}/SKILL.md`;

    it('exposes the artifact skill through native MCP resources and fallback tools', async () => {
        const references = await BuiltInSkills.listSkillToolReferences();
        const resources = await BuiltInSkills.listMcpResources();
        expect(references.map(({ name }) => name)).toContain(artifactSkill);
        expect(resources.map(({ uri }) => uri)).toContain(artifactUri);
        expect(
            await BuiltInSkills.getMcpResourceBody('skill://index.json'),
        ).toContain(`"name": "${artifactSkill}"`);

        const skill = await BuiltInSkills.readSkillTool(artifactSkill);
        expect(skill?.body).toContain('HTML/React');
        expect(skill?.body).toBe(
            await BuiltInSkills.getMcpResourceBody(artifactUri),
        );
        expect(skill?.skill.resources).toHaveLength(1);

        const resource = await BuiltInSkills.readSkillToolResource({
            name: artifactSkill,
            resourcePath: 'resources/result-contracts.md',
        });
        const resourceUri = `skill://lightdash/${artifactSkill}/resources/result-contracts.md`;
        expect(resources.map(({ uri }) => uri)).toContain(resourceUri);
        expect(resource?.body).toBe(
            await BuiltInSkills.getMcpResourceBody(resourceUri),
        );
        expect(resource?.body).toContain('isError');
        expect(resource?.body).toContain('queryUuid');
    });

    it('never advertises the MCP artifact skill to Agents', async () => {
        expect(
            (await BuiltInSkills.getAiAgentSkills()).map(({ name }) => name),
        ).not.toContain(artifactSkill);
    });

    it.each([
        'mcp-artifact-integration',
        '  MCP-ARTIFACT-INTEGRATION  ',
        'mcp-artifact-integration/resources/result-contracts.md',
    ])('prevents Agent direct reads of %s', async (name) => {
        expect(await BuiltInSkills.getAiAgentSkill(name)).toBeUndefined();
    });

    it('loads the developing-in-lightdash skill with its resources', async () => {
        const skills = await BuiltInSkills.getAiAgentSkills();
        const skill = skills.find((s) => s.name === 'developing-in-lightdash');

        expect(skill).toBeDefined();
        expect(skill?.description).toEqual(expect.any(String));
        expect(skill?.resources.length).toBeGreaterThan(0);
        skill?.resources.forEach((resource) => {
            expect(resource.name).toEqual(expect.any(String));
            expect(resource.description).toEqual(expect.any(String));
        });
    });

    it('returns a skill with its body and resource content', async () => {
        const skill = await BuiltInSkills.getAiAgentSkill(
            'developing-in-lightdash',
        );

        expect(skill).toBeDefined();
        expect(skill?.body).toEqual(expect.any(String));
        expect(skill?.body.length).toBeGreaterThan(0);
        expect(skill?.resources?.length).toBeGreaterThan(0);
        expect(skill?.resources?.[0].content).toEqual(expect.any(String));
    });

    it('documents current native and MCP tool names', async () => {
        const skill = await BuiltInSkills.readSkillTool(
            'developing-in-lightdash',
        );
        const dashboardReference = await BuiltInSkills.readSkillToolResource({
            name: 'developing-in-lightdash',
            resourcePath: 'dashboard-reference.md',
        });
        const periodReference = await BuiltInSkills.readSkillToolResource({
            name: 'developing-in-lightdash',
            resourcePath: 'period-over-period-reference.md',
        });

        expect(skill?.body).toContain('`read_content`');
        expect(skill?.body).toContain('`grep_fields` and `get_metadata`');
        expect(skill?.body).toContain('`run_metric_query`');
        expect(skill?.body).toContain('`generate_hashes`');
        expect(skill?.body).not.toContain('`discoverFields`');
        expect(dashboardReference?.body).toContain(
            'MCP clients must generate standard UUID v4 values locally',
        );
        expect(periodReference?.body).toContain('`generate_hashes` (MCP)');
    });

    it('matches skill names case-insensitively and trims input', async () => {
        const skill = await BuiltInSkills.getAiAgentSkill(
            '  Developing-In-Lightdash  ',
        );

        expect(skill?.name).toBe('developing-in-lightdash');
    });

    it('returns undefined for an unknown skill', async () => {
        expect(
            await BuiltInSkills.getAiAgentSkill('does-not-exist'),
        ).toBeUndefined();
    });
});
