import { ParameterError } from '@lightdash/common';
import * as fs from 'fs/promises';
import matter from 'gray-matter';
import * as path from 'path';
import {
    AiAgentSkill,
    AiAgentSkillReference,
    AiAgentSkillResource,
} from './types';

type SkillFrontmatter = {
    name: string;
    description: string;
};

/**
 * A single parsed markdown file within a skill directory — the skill's SKILL.md
 * or one of its supporting resource files. This is the shared, parse-once
 * representation that every consumer projects its own view from (the AI-agent
 * skill API and the MCP resource API).
 */
export type ParsedSkillFile = SkillFrontmatter & {
    fileName: string;
    content: string;
    raw: string;
};

/** A fully-loaded built-in skill: its SKILL.md plus supporting resource files. */
export type LoadedBuiltInSkill = {
    name: string;
    directory: string;
    skill: ParsedSkillFile;
    resources: ParsedSkillFile[];
};

/** A built-in skill file exposed as an MCP resource. */
export type BuiltInSkillMcpResource = {
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
    size: number;
};

type McpResourceWithBody = {
    resource: BuiltInSkillMcpResource;
    body: string;
};

/** A built-in skill's supporting file, as returned by the skill read tools. */
export type BuiltInSkillToolResource = {
    path: string;
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
    size: number;
};

/** A built-in skill, as returned by the list/read skill tools. */
export type BuiltInSkillToolReference = {
    name: string;
    uri: string;
    title: string;
    description: string;
    mimeType: string;
    size: number;
    resources: BuiltInSkillToolResource[];
};

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static readonly SKILL_INDEX_URI = 'skill://index.json';

    private static readonly SKILLS_DISCOVERY_SCHEMA =
        'https://schemas.agentskills.io/discovery/0.2.0/schema.json';

    private static loaded: LoadedBuiltInSkill[] | undefined;

    private static loadedPromise: Promise<LoadedBuiltInSkill[]> | undefined;

    private static mcpResources: McpResourceWithBody[] | undefined;

    private static parseSkillFile(
        filePath: string,
        fileContents: string,
    ): ParsedSkillFile {
        const { content, data } = matter(fileContents);
        const { name, description } = data as Partial<SkillFrontmatter>;

        if (!name || !description) {
            throw new ParameterError(
                `Missing required skill frontmatter in ${filePath}. Expected "name" and "description".`,
            );
        }

        return {
            fileName: path.basename(filePath),
            name,
            description,
            content,
            raw: fileContents,
        };
    }

    private static async readSkillFile(
        filePath: string,
    ): Promise<ParsedSkillFile> {
        return this.parseSkillFile(
            filePath,
            await fs.readFile(filePath, 'utf8'),
        );
    }

    private static async getSkillNames(): Promise<string[]> {
        const entries = await fs.readdir(this.SKILLS_DIR, {
            withFileTypes: true,
        });
        return entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }

    private static async readSkillResources(
        resourcesDir: string,
    ): Promise<ParsedSkillFile[]> {
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
                .map((fileName) =>
                    this.readSkillFile(path.join(resourcesDir, fileName)),
                ),
        );
    }

    private static async loadSkillDirectory(
        skillName: string,
    ): Promise<LoadedBuiltInSkill> {
        const directory = path.join(this.SKILLS_DIR, skillName);
        const skill = await this.readSkillFile(
            path.join(directory, 'SKILL.md'),
        );
        const resources = await this.readSkillResources(
            path.join(directory, 'resources'),
        );

        return { name: skill.name, directory, skill, resources };
    }

    /**
     * Reads and parses every built-in skill directory once, caching the result.
     * The single source of truth that both the AI-agent and MCP views build on.
     */
    private static async load(): Promise<LoadedBuiltInSkill[]> {
        if (this.loaded) {
            return this.loaded;
        }
        if (this.loadedPromise) {
            return this.loadedPromise;
        }

        this.loadedPromise = (async () => {
            try {
                const skillNames = await this.getSkillNames();
                const loaded = await Promise.all(
                    skillNames.map((skillName) =>
                        this.loadSkillDirectory(skillName),
                    ),
                );
                this.loaded = loaded;
                return loaded;
            } catch (error) {
                this.loadedPromise = undefined;
                throw error;
            }
        })();

        return this.loadedPromise;
    }

    private static toAiAgentResource(
        file: ParsedSkillFile,
    ): AiAgentSkillResource {
        return {
            name: file.name,
            description: file.description,
            content: file.content,
        };
    }

    private static toAiAgentSkill(skill: LoadedBuiltInSkill): AiAgentSkill {
        return {
            name: skill.skill.name,
            description: skill.skill.description,
            body: skill.skill.content,
            resources: skill.resources.map((resource) =>
                this.toAiAgentResource(resource),
            ),
        };
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
        return (await this.load()).map((skill) =>
            this.toSkillReference(this.toAiAgentSkill(skill)),
        );
    }

    static async getAiAgentSkill(
        name: string,
    ): Promise<AiAgentSkill | undefined> {
        const skill = (await this.load()).find(
            (loaded) => loaded.name.toLowerCase() === name.trim().toLowerCase(),
        );
        return skill ? this.toAiAgentSkill(skill) : undefined;
    }

    private static deriveTitleFromName(name: string): string {
        return name
            .split(/[-_/]/)
            .filter((part) => part.length > 0)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
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

    private static buildSkillIndex(
        skillResources: McpResourceWithBody[],
    ): McpResourceWithBody {
        const skills = skillResources
            .filter((item) => item.resource.uri.endsWith('/SKILL.md'))
            .map((item) => ({
                name: item.resource.name,
                type: 'skill-md',
                description: item.resource.description,
                url: item.resource.uri,
            }));
        const body = JSON.stringify(
            { $schema: this.SKILLS_DISCOVERY_SCHEMA, skills },
            null,
            2,
        );

        return {
            resource: {
                uri: this.SKILL_INDEX_URI,
                name: 'skills-index',
                title: 'Lightdash Skills Index',
                description:
                    'Index of Lightdash built-in skills exposed as MCP resources.',
                mimeType: 'application/json',
                size: Buffer.byteLength(body, 'utf8'),
            },
            body,
        };
    }

    /**
     * Projects the loaded skills into MCP resources (the SKILL.md, each
     * supporting file, and a discovery index), keyed by skill:// URI.
     */
    private static async loadMcpResources(): Promise<McpResourceWithBody[]> {
        if (this.mcpResources) {
            return this.mcpResources;
        }

        const skillResources = (await this.load()).flatMap((skill) => {
            const skillTitle = this.deriveTitleFromName(skill.name);
            const skillMd: McpResourceWithBody = {
                resource: {
                    uri: this.getSkillUri(skill.name),
                    name: skill.skill.name,
                    title: skillTitle,
                    description: skill.skill.description,
                    mimeType: 'text/markdown',
                    size: Buffer.byteLength(skill.skill.raw, 'utf8'),
                },
                body: skill.skill.raw,
            };
            const supporting = skill.resources.map((file) => ({
                resource: {
                    uri: this.getSkillResourceUri(skill.name, file.fileName),
                    name: `${skill.name}/resources/${path.basename(
                        file.fileName,
                        '.md',
                    )}`,
                    title: `${skillTitle} / ${this.deriveTitleFromName(
                        file.name,
                    )}`,
                    description: file.description,
                    mimeType: 'text/markdown',
                    size: Buffer.byteLength(file.raw, 'utf8'),
                },
                body: file.raw,
            }));
            return [skillMd, ...supporting];
        });

        const resources = [
            this.buildSkillIndex(skillResources),
            ...skillResources,
        ];
        this.mcpResources = resources;
        return resources;
    }

    static async listMcpResources(): Promise<BuiltInSkillMcpResource[]> {
        return (await this.loadMcpResources()).map((item) => item.resource);
    }

    static async getMcpResourceBody(uri: string): Promise<string | undefined> {
        return (await this.loadMcpResources()).find(
            (item) => item.resource.uri === uri,
        )?.body;
    }

    static async listSkillToolReferences(): Promise<
        BuiltInSkillToolReference[]
    > {
        return (await this.load()).map((skill) => {
            const skillTitle = this.deriveTitleFromName(skill.name);
            return {
                name: skill.name,
                uri: this.getSkillUri(skill.name),
                title: skillTitle,
                description: skill.skill.description,
                mimeType: 'text/markdown',
                size: Buffer.byteLength(skill.skill.raw, 'utf8'),
                resources: skill.resources.map((file) => ({
                    path: `resources/${file.fileName}`,
                    uri: this.getSkillResourceUri(skill.name, file.fileName),
                    name: `${skill.name}/resources/${path.basename(
                        file.fileName,
                        '.md',
                    )}`,
                    title: `${skillTitle} / ${this.deriveTitleFromName(
                        file.name,
                    )}`,
                    description: file.description,
                    mimeType: 'text/markdown',
                    size: Buffer.byteLength(file.raw, 'utf8'),
                })),
            };
        });
    }

    private static async getSkillToolReference(
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
}
