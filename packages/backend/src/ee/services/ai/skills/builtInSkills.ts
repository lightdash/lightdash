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
 * skill API today; the MCP resource API in later slices).
 */
export type ParsedSkillFile = SkillFrontmatter & {
    fileName: string;
    content: string;
};

/** A fully-loaded built-in skill: its SKILL.md plus supporting resource files. */
export type LoadedBuiltInSkill = {
    name: string;
    directory: string;
    skill: ParsedSkillFile;
    resources: ParsedSkillFile[];
};

export class BuiltInSkills {
    private static readonly SKILLS_DIR = path.join(__dirname, 'builtInSkills');

    private static loaded: LoadedBuiltInSkill[] | undefined;

    private static loadedPromise: Promise<LoadedBuiltInSkill[]> | undefined;

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
}
