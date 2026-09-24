import { AiAgentSkillReference } from '../skills/types';

// Without custom skills the section must stay byte-identical to the built-in-only prompt.
const renderIntro = (hasCustomSkills: boolean): string =>
    hasCustomSkills
        ? `You have optional skills that load on demand. Some ship with Lightdash; others were written by this organization for its own workflows.

- Use \`loadSkill\` when a request clearly matches a skill description or needs a specialized workflow.
- After loading a skill, follow its instructions.
- When a skill takes arguments, pass the user's request in \`arguments\` so its placeholders are filled.`
        : `You have optional built-in skills that load on demand.

- Use \`loadSkill\` when a request clearly matches a skill description or needs a specialized workflow.
- After loading a skill, follow its instructions.`;

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

${renderIntro(skills.some((skill) => skill.source === 'custom'))}
- If the skill exposes markdown resources, call \`loadSkill\` again with \`resourceName\` to load only the specific resource you need.

Available skills:
${skillLines}`;
};
