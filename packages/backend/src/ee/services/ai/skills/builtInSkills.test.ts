import { BuiltInSkills } from './builtInSkills';

describe('BuiltInSkills', () => {
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
