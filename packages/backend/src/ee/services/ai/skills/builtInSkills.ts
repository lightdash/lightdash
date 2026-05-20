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
    title: string;
    description: string;
};

export type BuiltInSkillMcpResource = {
    uri: string;
    name: string;
    title: string;
    description: string;
};

type CachedMcpResource = BuiltInSkillMcpResource & { content: string };

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static skills: AiAgentSkill[] = [];

    private static skillsPromise: Promise<AiAgentSkill[]> | undefined;

    private static mcpResources: CachedMcpResource[] | undefined;

    private static mcpResourcesPromise:
        | Promise<CachedMcpResource[]>
        | undefined;

    private static skillNames: string[] | undefined;

    private static skillNamesPromise: Promise<string[]> | undefined;

    private static isNodeErrnoException(
        error: unknown,
    ): error is NodeJS.ErrnoException {
        return error instanceof Error && 'code' in error;
    }

    private static async parseMarkdownFile(
        filePath: string,
    ): Promise<MarkdownMetadata & { content: string }> {
        const fileContents = await fs.readFile(filePath, 'utf8');
        const { content, data } = matter(fileContents);
        const { name, title, description } = data as Partial<MarkdownMetadata>;

        if (!name || !title || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name", "title" and "description".`,
            );
        }

        return { name, title, description, content };
    }

    private static getSkillDirectory(skillName: string): string {
        return path.join(this.SKILLS_DIR, skillName);
    }

    private static async getBuiltInSkillNames(): Promise<string[]> {
        if (this.skillNames) {
            return this.skillNames;
        }
        if (this.skillNamesPromise) {
            return this.skillNamesPromise;
        }

        this.skillNamesPromise = (async () => {
            try {
                const entries = await fs.readdir(this.SKILLS_DIR, {
                    withFileTypes: true,
                });
                const names = entries
                    .filter((entry) => entry.isDirectory())
                    .map((entry) => entry.name)
                    .sort();
                this.skillNames = names;
                return names;
            } catch (error) {
                this.skillNamesPromise = undefined;
                throw error;
            }
        })();

        return this.skillNamesPromise;
    }

    private static getSkillFilePath(skillName: string): string {
        return path.join(this.getSkillDirectory(skillName), 'SKILL.md');
    }

    private static getSkillResourcesDirectory(skillName: string): string {
        return path.join(this.getSkillDirectory(skillName), 'resources');
    }

    private static getSkillUri(skillName: string): string {
        return `lightdash://skills/${skillName}`;
    }

    private static getSkillResourceUri(
        skillName: string,
        resourceName: string,
    ): string {
        return `lightdash://skills/${skillName}/resources/${resourceName}`;
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

    private static async loadMcpResourcesForSkill(
        skillName: string,
    ): Promise<CachedMcpResource[]> {
        const skill = await this.parseMarkdownFile(
            this.getSkillFilePath(skillName),
        );

        const resources: CachedMcpResource[] = [
            {
                uri: this.getSkillUri(skillName),
                name: skill.name,
                title: skill.title,
                description: skill.description,
                content: skill.content,
            },
        ];

        const resourcesDir = this.getSkillResourcesDirectory(skillName);
        let resourceFileNames: string[];
        try {
            resourceFileNames = await fs.readdir(resourcesDir);
        } catch (error) {
            if (this.isNodeErrnoException(error) && error.code === 'ENOENT') {
                return resources;
            }
            throw error;
        }

        const nestedResources = await Promise.all(
            resourceFileNames
                .filter((fileName) => fileName.endsWith('.md'))
                .sort()
                .map(async (fileName) => {
                    const resourceName = path.basename(fileName, '.md');
                    const resource = await this.parseMarkdownFile(
                        path.join(resourcesDir, fileName),
                    );

                    return {
                        uri: this.getSkillResourceUri(skillName, resourceName),
                        name: `${skillName}/${resourceName}`,
                        title: `${skill.title} / ${resource.title}`,
                        description: resource.description,
                        content: resource.content,
                    };
                }),
        );

        return [...resources, ...nestedResources];
    }

    private static async loadMcpResources(): Promise<CachedMcpResource[]> {
        if (this.mcpResources) {
            return this.mcpResources;
        }
        if (this.mcpResourcesPromise) {
            return this.mcpResourcesPromise;
        }

        this.mcpResourcesPromise = (async () => {
            try {
                const skillNames = await this.getBuiltInSkillNames();
                const perSkill = await Promise.all(
                    skillNames.map((skillName) =>
                        this.loadMcpResourcesForSkill(skillName),
                    ),
                );
                const resources = perSkill.flat();
                this.mcpResources = resources;
                return resources;
            } catch (error) {
                this.mcpResourcesPromise = undefined;
                throw error;
            }
        })();

        return this.mcpResourcesPromise;
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
                const skillNames = await this.getBuiltInSkillNames();
                const skills = await Promise.all(
                    skillNames.map((skillName) =>
                        this.loadSkillFromDirectory(
                            this.getSkillDirectory(skillName),
                        ),
                    ),
                );

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

    static async listMcpResources(): Promise<BuiltInSkillMcpResource[]> {
        return (await this.loadMcpResources()).map(
            ({ content, ...resource }) => resource,
        );
    }

    static async getMcpResourceBody(uri: string): Promise<string | undefined> {
        return (await this.loadMcpResources()).find(
            (resource) => resource.uri === uri,
        )?.content;
    }
}
