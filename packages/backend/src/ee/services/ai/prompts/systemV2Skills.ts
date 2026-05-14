import { AiAgentSkillReference } from '../skills/types';

export const renderAvailableSkills = (
    skills: AiAgentSkillReference[],
): string => {
    if (skills.length === 0) {
        return '';
    }

    const skillLines = skills
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join('\n');

    return `## Agent Skills

You have optional built-in skills that load on demand.

- Use \`loadSkill\` when a request clearly matches a skill description or needs a specialized workflow.
- After loading a skill, follow its instructions.
- If the skill exposes markdown resources, use \`loadSkillResource\` to load only the specific resource you need.

Available skills:
${skillLines}`;
};
