import { ParameterError } from '@lightdash/common';
import crypto from 'crypto';
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
    title: string;
    description: string;
};

type ParsedMarkdownFile = MarkdownMetadata & {
    content: string;
    rawContent: string;
    digest: string;
    size: number;
};

export type BuiltInSkillMcpResource = {
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
    size?: number;
};

type CachedMcpResource = BuiltInSkillMcpResource & {
    content?: string;
    filePath?: string;
    digest?: string;
};

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static skills: AiAgentSkill[] = [];

    private static skillsPromise: Promise<AiAgentSkill[]> | undefined;

    private static mcpResources: CachedMcpResource[] | undefined;

    private static mcpResourcesPromise:
        | Promise<CachedMcpResource[]>
        | undefined;

    private static mcpResourceBodyCache = new Map<string, string>();

    private static skillNames: string[] | undefined;

    private static skillNamesPromise: Promise<string[]> | undefined;

    private static isNodeErrnoException(
        error: unknown,
    ): error is NodeJS.ErrnoException {
        return error instanceof Error && 'code' in error;
    }

    private static getContentDigest(fileContents: string): string {
        return `sha256:${crypto
            .createHash('sha256')
            .update(fileContents)
            .digest('hex')}`;
    }

    private static parseMarkdownContent(
        filePath: string,
        fileContents: string,
    ): ParsedMarkdownFile {
        const { content, data } = matter(fileContents);
        const { name, title, description } = data as Partial<MarkdownMetadata>;

        if (!name || !title || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name", "title" and "description".`,
            );
        }

        return {
            name,
            title,
            description,
            content,
            rawContent: fileContents,
            digest: this.getContentDigest(fileContents),
            size: Buffer.byteLength(fileContents, 'utf8'),
        };
    }

    private static async parseMarkdownFile(
        filePath: string,
    ): Promise<ParsedMarkdownFile> {
        return this.parseMarkdownContent(
            filePath,
            await fs.readFile(filePath, 'utf8'),
        );
    }

    private static parseMarkdownFileSync(filePath: string): ParsedMarkdownFile {
        return this.parseMarkdownContent(
            filePath,
            fsSync.readFileSync(filePath, 'utf8'),
        );
    }

    private static getSkillDirectory(skillName: string): string {
        return path.join(this.SKILLS_DIR, skillName);
    }

    private static getBuiltInSkillNamesSync(): string[] {
        if (this.skillNames) {
            return this.skillNames;
        }

        const names = fsSync
            .readdirSync(this.SKILLS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        this.skillNames = names;
        return names;
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
        return `skill://${skillName}/SKILL.md`;
    }

    private static getSkillResourceUri(
        skillName: string,
        fileName: string,
    ): string {
        return `skill://${skillName}/resources/${fileName}`;
    }

    private static getSkillIndexUri(): string {
        return 'skill://index.json';
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

    private static buildSkillMcpResources(
        skillName: string,
        skill: ParsedMarkdownFile,
        skillFilePath: string,
        resourceFileNames: string[],
        resourcesDir: string,
        readResource: (fileName: string) => ParsedMarkdownFile,
    ): CachedMcpResource[] {
        const resources: CachedMcpResource[] = [
            {
                uri: this.getSkillUri(skillName),
                name: skill.name,
                title: skill.title,
                description: skill.description,
                mimeType: 'text/markdown',
                size: skill.size,
                filePath: skillFilePath,
                digest: skill.digest,
            },
        ];

        const nestedResources = resourceFileNames
            .filter((fileName) => fileName.endsWith('.md'))
            .sort()
            .map((fileName) => {
                const resourceName = path.basename(fileName, '.md');
                const resource = readResource(fileName);

                return {
                    uri: this.getSkillResourceUri(skillName, fileName),
                    name: `${skillName}/resources/${resourceName}`,
                    title: `${skill.title} / ${resource.title}`,
                    description: resource.description,
                    mimeType: 'text/markdown',
                    size: resource.size,
                    filePath: path.join(resourcesDir, fileName),
                    digest: resource.digest,
                };
            });

        return [...resources, ...nestedResources];
    }

    private static loadMcpResourcesForSkillSync(
        skillName: string,
    ): CachedMcpResource[] {
        const skillFilePath = this.getSkillFilePath(skillName);
        const skill = this.parseMarkdownFileSync(skillFilePath);
        const resourcesDir = this.getSkillResourcesDirectory(skillName);

        let resourceFileNames: string[];
        try {
            resourceFileNames = fsSync.readdirSync(resourcesDir);
        } catch (error) {
            if (this.isNodeErrnoException(error) && error.code === 'ENOENT') {
                resourceFileNames = [];
            } else {
                throw error;
            }
        }

        return this.buildSkillMcpResources(
            skillName,
            skill,
            skillFilePath,
            resourceFileNames,
            resourcesDir,
            (fileName) =>
                this.parseMarkdownFileSync(path.join(resourcesDir, fileName)),
        );
    }

    private static async loadMcpResourcesForSkill(
        skillName: string,
    ): Promise<CachedMcpResource[]> {
        const skillFilePath = this.getSkillFilePath(skillName);
        const skill = await this.parseMarkdownFile(skillFilePath);
        const resourcesDir = this.getSkillResourcesDirectory(skillName);

        let resourceFileNames: string[];
        try {
            resourceFileNames = await fs.readdir(resourcesDir);
        } catch (error) {
            if (this.isNodeErrnoException(error) && error.code === 'ENOENT') {
                resourceFileNames = [];
            } else {
                throw error;
            }
        }

        const resources = await Promise.all(
            resourceFileNames
                .filter((fileName) => fileName.endsWith('.md'))
                .map(async (fileName) => ({
                    fileName,
                    resource: await this.parseMarkdownFile(
                        path.join(resourcesDir, fileName),
                    ),
                })),
        );

        return this.buildSkillMcpResources(
            skillName,
            skill,
            skillFilePath,
            resourceFileNames,
            resourcesDir,
            (fileName) =>
                resources.find((item) => item.fileName === fileName)!.resource,
        );
    }

    private static buildMcpSkillIndex(
        skillResources: CachedMcpResource[],
    ): CachedMcpResource {
        const skills = skillResources
            .filter((resource) => resource.uri.endsWith('/SKILL.md'))
            .map((resource) => ({
                name: resource.name,
                type: 'skill-md',
                description: resource.description,
                url: resource.uri,
                digest: resource.digest,
            }));
        const content = JSON.stringify(
            {
                $schema:
                    'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
                skills,
            },
            null,
            2,
        );

        return {
            uri: this.getSkillIndexUri(),
            name: 'skills-index',
            title: 'Lightdash Skills Index',
            description:
                'Index of Lightdash built-in skills exposed as MCP resources.',
            mimeType: 'application/json',
            size: Buffer.byteLength(content, 'utf8'),
            content,
        };
    }

    private static loadMcpResourcesSync(): CachedMcpResource[] {
        if (this.mcpResources) {
            return this.mcpResources;
        }

        const skillNames = this.getBuiltInSkillNamesSync();
        const skillResources = skillNames.flatMap((skillName) =>
            this.loadMcpResourcesForSkillSync(skillName),
        );
        const resources = [
            this.buildMcpSkillIndex(skillResources),
            ...skillResources,
        ];
        this.mcpResources = resources;
        return resources;
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
                const skillResources = perSkill.flat();
                const resources = [
                    this.buildMcpSkillIndex(skillResources),
                    ...skillResources,
                ];
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

    static listMcpResourcesSync(): BuiltInSkillMcpResource[] {
        return this.loadMcpResourcesSync().map(
            ({ content, digest, filePath, ...resource }) => resource,
        );
    }

    static async listMcpResources(): Promise<BuiltInSkillMcpResource[]> {
        return (await this.loadMcpResources()).map(
            ({ content, digest, filePath, ...resource }) => resource,
        );
    }

    static getMcpResourceBodySync(uri: string): string | undefined {
        const resource = this.loadMcpResourcesSync().find(
            (mcpResource) => mcpResource.uri === uri,
        );
        if (!resource) {
            return undefined;
        }
        if (resource.content !== undefined) {
            return resource.content;
        }
        const cached = this.mcpResourceBodyCache.get(uri);
        if (cached !== undefined) {
            return cached;
        }
        if (!resource.filePath) {
            return undefined;
        }
        const body = fsSync.readFileSync(resource.filePath, 'utf8');
        this.mcpResourceBodyCache.set(uri, body);
        return body;
    }

    static async getMcpResourceBody(uri: string): Promise<string | undefined> {
        const resource = this.loadMcpResourcesSync().find(
            (mcpResource) => mcpResource.uri === uri,
        );
        if (!resource) {
            return undefined;
        }
        if (resource.content !== undefined) {
            return resource.content;
        }
        const cached = this.mcpResourceBodyCache.get(uri);
        if (cached !== undefined) {
            return cached;
        }
        if (!resource.filePath) {
            return undefined;
        }
        const body = await fs.readFile(resource.filePath, 'utf8');
        this.mcpResourceBodyCache.set(uri, body);
        return body;
    }
}
