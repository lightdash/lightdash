import { ParameterError } from '@lightdash/common';
import * as fsSync from 'fs';
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

export type BuiltInSkillMcpResource = {
    uri: string;
    name: string;
    title: string;
    description: string;
    skillName: string;
    resourceName?: string;
};

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static readonly TITLE_CASE_LOWER_WORDS = new Set([
        'a',
        'an',
        'and',
        'as',
        'at',
        'but',
        'by',
        'for',
        'in',
        'nor',
        'of',
        'on',
        'or',
        'the',
        'to',
        'with',
    ]);

    private static skills: AiAgentSkill[] = [];

    private static skillsPromise: Promise<AiAgentSkill[]> | undefined;

    private static mcpResources: BuiltInSkillMcpResource[] | undefined;

    private static skillNames: string[] | undefined;

    private static getMarkdownMetadata(
        filePath: string,
        data: unknown,
    ): MarkdownMetadata {
        const { name, description } = data as Partial<MarkdownMetadata>;

        if (!name || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name" and "description".`,
            );
        }

        return { name, description };
    }

    private static async parseMarkdownFile(
        filePath: string,
    ): Promise<MarkdownMetadata & { content: string }> {
        const fileContents = await fs.readFile(filePath, 'utf8');
        const { content, data } = matter(fileContents);

        return {
            ...this.getMarkdownMetadata(filePath, data),
            content,
        };
    }

    private static parseMarkdownFileSync(filePath: string): MarkdownMetadata {
        const fileContents = fsSync.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContents);

        return this.getMarkdownMetadata(filePath, data);
    }

    private static getSkillDirectory(skillName: string): string {
        return path.join(this.SKILLS_DIR, skillName);
    }

    private static getBuiltInSkillNames(): string[] {
        if (this.skillNames) {
            return this.skillNames;
        }

        this.skillNames = fsSync
            .readdirSync(this.SKILLS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

        return this.skillNames;
    }

    private static getSkillFilePath(skillName: string): string {
        return path.join(this.getSkillDirectory(skillName), 'SKILL.md');
    }

    private static getSkillResourcesDirectory(skillName: string): string {
        return path.join(this.getSkillDirectory(skillName), 'resources');
    }

    private static getSkillResourceUri(
        skillName: string,
        resourceName?: string,
    ): string {
        return resourceName
            ? `lightdash://skills/${skillName}/resources/${resourceName}`
            : `lightdash://skills/${skillName}`;
    }

    private static formatResourceTitleSegment(segment: string): string {
        return segment
            .split('-')
            .map((word, index, words) => {
                const normalizedWord = word.toLowerCase();
                if (
                    index > 0 &&
                    index < words.length - 1 &&
                    this.TITLE_CASE_LOWER_WORDS.has(normalizedWord)
                ) {
                    return normalizedWord;
                }

                return (
                    normalizedWord.charAt(0).toUpperCase() +
                    normalizedWord.slice(1)
                );
            })
            .join(' ');
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

    private static listMcpSkillResourcesForSkill(
        skillName: string,
    ): BuiltInSkillMcpResource[] {
        const resourcesDir = this.getSkillResourcesDirectory(skillName);

        if (!fsSync.existsSync(resourcesDir)) {
            return [];
        }

        return fsSync
            .readdirSync(resourcesDir)
            .filter((fileName) => fileName.endsWith('.md'))
            .sort()
            .map((fileName) => {
                const resourceName = path.basename(fileName, '.md');
                const resource = this.parseMarkdownFileSync(
                    path.join(resourcesDir, fileName),
                );

                return {
                    uri: this.getSkillResourceUri(skillName, resourceName),
                    name: `${skillName}/${resourceName}`,
                    title: `${this.formatResourceTitleSegment(skillName)} / ${this.formatResourceTitleSegment(resourceName)}`,
                    description: resource.description,
                    skillName,
                    resourceName,
                };
            });
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
                const skillPromises = this.getBuiltInSkillNames().map(
                    (skillName) =>
                        this.loadSkillFromDirectory(
                            path.join(this.SKILLS_DIR, skillName),
                        ),
                );
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

    static listMcpResources(): BuiltInSkillMcpResource[] {
        if (this.mcpResources) {
            return this.mcpResources;
        }

        this.mcpResources = this.getBuiltInSkillNames().flatMap((skillName) => {
            const skill = this.parseMarkdownFileSync(
                this.getSkillFilePath(skillName),
            );

            return [
                {
                    uri: this.getSkillResourceUri(skillName),
                    name: skill.name,
                    title: this.formatResourceTitleSegment(skillName),
                    description: skill.description,
                    skillName,
                },
                ...this.listMcpSkillResourcesForSkill(skillName),
            ];
        });

        return this.mcpResources;
    }

    static async getMcpSkillBody(
        skillName: string,
    ): Promise<string | undefined> {
        if (!this.getBuiltInSkillNames().includes(skillName)) {
            return undefined;
        }

        const skill = await this.parseMarkdownFile(
            this.getSkillFilePath(skillName),
        );

        return skill.content;
    }

    static async getMcpSkillResourceBody(
        skillName: string,
        resourceName: string,
    ): Promise<string | undefined> {
        if (!this.getBuiltInSkillNames().includes(skillName)) {
            return undefined;
        }

        try {
            const resource = await this.parseMarkdownFile(
                path.join(
                    this.getSkillResourcesDirectory(skillName),
                    `${resourceName}.md`,
                ),
            );

            return resource.content;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }

            throw error;
        }
    }
}
