import { ParameterError } from '@lightdash/common';
import * as fs from 'fs/promises';
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

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static skills: AiAgentSkill[] = [];

    private static skillsPromise: Promise<AiAgentSkill[]> | undefined;

    private static async parseMarkdownFile(
        filePath: string,
    ): Promise<MarkdownMetadata & { content: string }> {
        const fileContents = await fs.readFile(filePath, 'utf8');
        const { content, data } = matter(fileContents);
        const { name, description } = data as Partial<MarkdownMetadata>;

        if (!name || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name" and "description".`,
            );
        }

        return {
            name,
            description,
            content,
        };
    }

    private static async loadSkillResources(
        resourcesDir: string,
    ): Promise<AiAgentSkillResource[]> {
        try {
            await fs.access(resourcesDir);
        } catch {
            return [];
        }

        const fileNames = await fs.readdir(resourcesDir);

        return Promise.all(
            fileNames
                .filter((fileName) => fileName.endsWith('.md'))
                .sort()
                .map(async (fileName) => {
                    const resource = await this.parseMarkdownFile(
                        path.join(resourcesDir, fileName),
                    );

                    return {
                        name: resource.name,
                        description: resource.description,
                        content: resource.content,
                    };
                }),
        );
    }

    private static async loadSkillFromDirectory(
        skillDir: string,
    ): Promise<AiAgentSkill> {
        const skill = await this.parseMarkdownFile(
            path.join(skillDir, 'SKILL.md'),
        );

        return {
            name: skill.name,
            description: skill.description,
            body: skill.content,
            resources: await this.loadSkillResources(
                path.join(skillDir, 'resources'),
            ),
        };
    }

    private static async getBuiltInSkills(): Promise<AiAgentSkill[]> {
        if (this.skills.length > 0) {
            return this.skills;
        }

        if (this.skillsPromise) {
            return this.skillsPromise;
        }

        this.skillsPromise = (async () => {
            try {
                const skillPromises = [
                    this.loadSkillFromDirectory(
                        path.join(this.SKILLS_DIR, 'developing-in-lightdash'),
                    ),
                ];
                const skills = await Promise.all(skillPromises);

                this.skills = skills;
                return skills;
            } catch (error) {
                this.skillsPromise = undefined;
                throw error;
            }
        })();

        return this.skillsPromise;
    }

    private static toSkillReference(
        skill: AiAgentSkill,
    ): AiAgentSkillReference {
        return {
            name: skill.name,
            description: skill.description,
            resources:
                skill.resources?.map((resource) => ({
                    name: resource.name,
                    description: resource.description,
                })) ?? [],
        };
    }

    static async getAiAgentSkills(): Promise<AiAgentSkillReference[]> {
        return (await this.getBuiltInSkills()).map(this.toSkillReference);
    }

    static async getAiAgentSkill(
        name: string,
    ): Promise<AiAgentSkill | undefined> {
        return (await this.getBuiltInSkills()).find(
            (skill) => skill.name.toLowerCase() === name.trim().toLowerCase(),
        );
    }
}
