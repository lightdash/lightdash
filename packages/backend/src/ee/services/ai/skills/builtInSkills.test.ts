import { BuiltInSkills } from './builtInSkills';

describe('BuiltInSkills', () => {
    it('loads the developing-lightdash-content skill with its resources', async () => {
        const skills = await BuiltInSkills.getAiAgentSkills();
        const skill = skills.find(
            (s) => s.name === 'developing-lightdash-content',
        );

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
            'developing-lightdash-content',
        );

        expect(skill).toBeDefined();
        expect(skill?.body).toEqual(expect.any(String));
        expect(skill?.body.length).toBeGreaterThan(0);
        expect(skill?.resources?.length).toBeGreaterThan(0);
        expect(skill?.resources?.[0].content).toEqual(expect.any(String));
    });

    it('matches skill names case-insensitively and trims input', async () => {
        const skill = await BuiltInSkills.getAiAgentSkill(
            '  Developing-Lightdash-Content  ',
        );

        expect(skill?.name).toBe('developing-lightdash-content');
    });

    it('loads the focused data-answering and writeback skills', async () => {
        const skills = await BuiltInSkills.getAiAgentSkills();
        const skillNames = skills.map((skill) => skill.name);

        expect(skillNames).toContain('answering-data-questions');
        expect(skillNames).toContain('developing-lightdash-content');
        expect(skillNames).toContain('semantic-layer-writeback');
        expect(skillNames).not.toContain('developing-in-lightdash');
    });

    it('keeps writeback validation policy in the semantic-layer-writeback skill', async () => {
        const skill = await BuiltInSkills.getAiAgentSkill(
            'semantic-layer-writeback',
        );

        expect(skill?.body).toContain('Value Correctness');
        expect(skill?.body).toContain('By construction');
        expect(skill?.body).toContain('By data');
        expect(skill?.body).toContain('impact analysis');
        expect(skill?.body).toContain('Post-Merge');
    });

    it('returns undefined for an unknown skill', async () => {
        expect(
            await BuiltInSkills.getAiAgentSkill('does-not-exist'),
        ).toBeUndefined();
    });
});
