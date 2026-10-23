import { AiAgentSkillReference } from '../skills/types';

// Without custom skills the section must stay byte-identical to the built-in-only prompt.
const CUSTOM_SKILLS_ORIGIN =
    ' Some ship with Lightdash; others were written by this organization for its own workflows.';

export const renderAvailableSkills = (
    skills: AiAgentSkillReference[],
): string => {
    if (skills.length === 0) {
        return '';
    }

    const skillLines = skills
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join('\n');
    const origin = skills.some((skill) => skill.source === 'custom')
        ? CUSTOM_SKILLS_ORIGIN
        : '';

    return `## Agent Skills

Skills hold guidance for specialized workflows.${origin} When a request clearly matches a skill's description below, load it with \`loadSkill\` and follow its instructions.

Available skills:
${skillLines}`;
};
