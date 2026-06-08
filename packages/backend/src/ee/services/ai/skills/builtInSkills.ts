import { ParameterError } from '@lightdash/common';
import crypto from 'crypto';
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

type ParsedMarkdownFile = MarkdownMetadata & {
    title: string;
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

export type BuiltInSkillToolResource = {
    path: string;
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
    size: number;
    digest: string;
};

export type BuiltInSkillToolReference = {
    name: string;
    uri: string;
    title: string;
    description: string;
    mimeType: string;
    size: number;
    digest: string;
    resources: BuiltInSkillToolResource[];
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

    private static deriveTitleFromName(name: string): string {
        return name
            .split(/[-_/]/)
            .filter((part) => part.length > 0)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private static parseMarkdownContent(
        filePath: string,
        fileContents: string,
    ): ParsedMarkdownFile {
        const { content, data } = matter(fileContents);
        const { name, description, metadata } =
            data as Partial<MarkdownMetadata> & {
                metadata?: { title?: string };
            };

        if (!name || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name" and "description".`,
            );
        }

        // Agent Skills frontmatter recognizes only name + description at the top
        // level; the display title lives under the optional metadata map and
        // falls back to a name-derived title.
        return {
            name,
            title: metadata?.title ?? this.deriveTitleFromName(name),
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

    private static getSkillResourcePath(
        skillName: string,
        resource: CachedMcpResource,
    ): string | undefined {
        const prefix = `skill://${skillName}/resources/`;
        if (!resource.uri.startsWith(prefix)) {
            return undefined;
        }

        return `resources/${resource.uri.slice(prefix.length)}`;
    }

    private static toSkillToolResource(
        skillName: string,
        resource: CachedMcpResource,
    ): BuiltInSkillToolResource | undefined {
        const resourcePath = this.getSkillResourcePath(skillName, resource);
        if (!resourcePath || !resource.size || !resource.digest) {
            return undefined;
        }

        return {
            path: resourcePath,
            uri: resource.uri,
            name: resource.name,
            title: resource.title,
            description: resource.description,
            mimeType: resource.mimeType,
            size: resource.size,
            digest: resource.digest,
        };
    }

    static async listSkillToolReferences(): Promise<
        BuiltInSkillToolReference[]
    > {
        const resources = await this.loadMcpResources();
        return resources
            .filter((resource) => resource.uri.endsWith('/SKILL.md'))
            .map((skillResource) => {
                if (!skillResource.size || !skillResource.digest) {
                    throw new ParameterError(
                        `Missing metadata for skill resource ${skillResource.uri}`,
                    );
                }

                return {
                    name: skillResource.name,
                    uri: skillResource.uri,
                    title: skillResource.title,
                    description: skillResource.description,
                    mimeType: skillResource.mimeType,
                    size: skillResource.size,
                    digest: skillResource.digest,
                    resources: resources
                        .map((resource) =>
                            this.toSkillToolResource(
                                skillResource.name,
                                resource,
                            ),
                        )
                        .filter(
                            (resource): resource is BuiltInSkillToolResource =>
                                resource !== undefined,
                        ),
                };
            });
    }

    static async getSkillToolReference(
        name: string,
    ): Promise<BuiltInSkillToolReference | undefined> {
        return (await this.listSkillToolReferences()).find(
            (skill) => skill.name.toLowerCase() === name.trim().toLowerCase(),
        );
    }

    static async readSkillTool(
        name: string,
    ): Promise<{ skill: BuiltInSkillToolReference; body: string } | undefined> {
        const skill = await this.getSkillToolReference(name);
        if (!skill) {
            return undefined;
        }

        const body = await this.getMcpResourceBody(skill.uri);
        if (body === undefined) {
            return undefined;
        }

        return { skill, body };
    }

    static async readSkillToolResource({
        name,
        resourcePath,
    }: {
        name: string;
        resourcePath: string;
    }): Promise<
        | {
              skillName: string;
              resource: BuiltInSkillToolResource;
              body: string;
          }
        | undefined
    > {
        const skill = await this.getSkillToolReference(name);
        if (!skill) {
            return undefined;
        }

        const normalizedPath = resourcePath.startsWith('resources/')
            ? resourcePath
            : `resources/${resourcePath}`;
        const resource = skill.resources.find(
            (item) => item.path === normalizedPath,
        );
        if (!resource) {
            return undefined;
        }

        const body = await this.getMcpResourceBody(resource.uri);
        if (body === undefined) {
            return undefined;
        }

        return { skillName: skill.name, resource, body };
    }

    static async listMcpResources(): Promise<BuiltInSkillMcpResource[]> {
        return (await this.loadMcpResources()).map(
            ({ content, digest, filePath, ...resource }) => resource,
        );
    }

    static async getMcpResourceBody(uri: string): Promise<string | undefined> {
        const resource = (await this.loadMcpResources()).find(
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
