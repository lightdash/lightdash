import * as fs from 'fs';
import matter from 'gray-matter';
import * as path from 'path';
import {
    AiAgentSkill,
    AiAgentSkillReference,
    AiAgentSkillResource,
} from './types';

type MarkdownMetadata = {
    name: string;
    description: string;
};

const parseMarkdownFile = (
    filePath: string,
): MarkdownMetadata & { content: string } => {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const { content, data } = matter(fileContents);
    const { name, description } = data as Partial<MarkdownMetadata>;

    if (!name || !description) {
        throw new Error(
            `Missing required skill frontmatter in ${filePath}. Expected "name" and "description".`,
        );
    }

    return {
        name,
        description,
        content,
    };
};

const loadSkillResources = (resourcesDir: string): AiAgentSkillResource[] => {
    if (!fs.existsSync(resourcesDir)) {
        return [];
    }

    return fs
        .readdirSync(resourcesDir)
        .filter((fileName) => fileName.endsWith('.md'))
        .sort()
        .map((fileName) => {
            const resource = parseMarkdownFile(
                path.join(resourcesDir, fileName),
            );

            return {
                name: resource.name,
                description: resource.description,
                content: resource.content,
            };
        });
};

const loadSkillFromDirectory = (skillDir: string): AiAgentSkill => {
    const skill = parseMarkdownFile(path.join(skillDir, 'SKILL.md'));

    return {
        name: skill.name,
        description: skill.description,
        body: skill.content,
        resources: loadSkillResources(path.join(skillDir, 'resources')),
    };
};

const BUILT_IN_AGENT_SKILLS_DIR = path.join(__dirname, 'builtInSkills');

const BUILT_IN_AGENT_SKILLS: ReadonlyArray<AiAgentSkill> = [
    loadSkillFromDirectory(
        path.join(BUILT_IN_AGENT_SKILLS_DIR, 'developing-in-lightdash'),
    ),
];

const toSkillReference = (skill: AiAgentSkill): AiAgentSkillReference => ({
    name: skill.name,
    description: skill.description,
    resources:
        skill.resources?.map((resource) => ({
            name: resource.name,
            description: resource.description,
        })) ?? [],
});

export const getAiAgentSkills = (): AiAgentSkillReference[] =>
    BUILT_IN_AGENT_SKILLS.map(toSkillReference);

export const getAiAgentSkill = (name: string): AiAgentSkill | undefined =>
    BUILT_IN_AGENT_SKILLS.find(
        (skill) => skill.name.toLowerCase() === name.trim().toLowerCase(),
    );

export const getAiAgentSkillResource = ({
    skillName,
    resourceName,
}: {
    skillName: string;
    resourceName: string;
}): AiAgentSkillResource | undefined =>
    getAiAgentSkill(skillName)?.resources?.find(
        (resource) =>
            resource.name.toLowerCase() === resourceName.trim().toLowerCase(),
    );
