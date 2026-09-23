import {
    AI_AGENT_SKILL_FILE_NAME,
    AI_AGENT_SKILL_RESOURCES_DIR,
    getErrorMessage,
    validateAiAgentSkill,
    type AiAgentSkillFiles,
    type ApiSkillsAsCodeListResponse,
    type ApiSkillsAsCodeUpsertRequest,
    type ApiSkillsAsCodeUpsertResponse,
    type SkillAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

export const SKILLS_FOLDER_NAME = 'skills';

const isEnoent = (error: unknown): boolean =>
    (error as NodeJS.ErrnoException).code === 'ENOENT';

export const getSkillsFolder = (basePath: string): string =>
    path.join(basePath, SKILLS_FOLDER_NAME);

const listDirectories = async (folder: string): Promise<string[]> => {
    try {
        return (await fs.readdir(folder, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    } catch (error) {
        if (isEnoent(error)) return [];
        throw error;
    }
};

const listMarkdownFiles = async (folder: string): Promise<string[]> => {
    try {
        return (await fs.readdir(folder, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
            .map((entry) => entry.name)
            .sort();
    } catch (error) {
        if (isEnoent(error)) return [];
        throw error;
    }
};

const readSkillFolder = async (
    folder: string,
    name: string,
): Promise<{ skill: SkillAsCode } | { failure: string }> => {
    const skillPath = path.join(folder, name);
    let skillMarkdown: string;
    try {
        skillMarkdown = await fs.readFile(
            path.join(skillPath, AI_AGENT_SKILL_FILE_NAME),
            'utf8',
        );
    } catch (error) {
        if (isEnoent(error)) {
            return {
                failure: `${SKILLS_FOLDER_NAME}/${name}: missing ${AI_AGENT_SKILL_FILE_NAME}`,
            };
        }
        throw error;
    }
    const resourcesPath = path.join(skillPath, AI_AGENT_SKILL_RESOURCES_DIR);
    const resourceEntries = await Promise.all(
        (await listMarkdownFiles(resourcesPath)).map(
            async (fileName) =>
                [
                    `${AI_AGENT_SKILL_RESOURCES_DIR}/${fileName}`,
                    await fs.readFile(
                        path.join(resourcesPath, fileName),
                        'utf8',
                    ),
                ] as const,
        ),
    );
    const files: AiAgentSkillFiles = Object.fromEntries([
        [AI_AGENT_SKILL_FILE_NAME, skillMarkdown],
        ...resourceEntries,
    ]);
    return { skill: { name, files } };
};

/**
 * Reads every `skills/<name>/` folder: its SKILL.md plus flat markdown files
 * under resources/. Anything else in the folder is ignored so authors can keep
 * notes beside a skill without them being uploaded.
 */
export const readSkillFolders = async (
    basePath: string,
): Promise<{ skills: SkillAsCode[]; failures: string[] }> => {
    const folder = getSkillsFolder(basePath);
    const results = await Promise.all(
        (await listDirectories(folder)).map((name) =>
            readSkillFolder(folder, name),
        ),
    );
    return {
        skills: results.flatMap((result) =>
            'skill' in result ? [result.skill] : [],
        ),
        failures: results.flatMap((result) =>
            'failure' in result ? [result.failure] : [],
        ),
    };
};

const writeSkillFolder = async (
    folder: string,
    skill: SkillAsCode,
): Promise<void> => {
    const skillPath = path.join(folder, skill.name);
    await fs.rm(skillPath, { recursive: true, force: true });
    await fs.mkdir(path.join(skillPath, AI_AGENT_SKILL_RESOURCES_DIR), {
        recursive: true,
    });
    await Promise.all(
        Object.entries(skill.files).map(([filePath, content]) =>
            fs.writeFile(path.join(skillPath, filePath), content),
        ),
    );
};

/**
 * Writes skill folders. With prune, folders on disk that are not in the set
 * are removed, so a full download mirrors the server.
 */
export const writeSkillFolders = async (
    basePath: string,
    skills: SkillAsCode[],
    prune: boolean,
): Promise<void> => {
    const folder = getSkillsFolder(basePath);
    await fs.mkdir(folder, { recursive: true });
    if (prune) {
        const wanted = new Set(skills.map((skill) => skill.name));
        await Promise.all(
            (await listDirectories(folder))
                .filter((name) => !wanted.has(name))
                .map((name) =>
                    fs.rm(path.join(folder, name), {
                        recursive: true,
                        force: true,
                    }),
                ),
        );
    }
    await Promise.all(skills.map((skill) => writeSkillFolder(folder, skill)));
};

export const downloadSkills = async ({
    names,
    customPath,
    basePath,
}: {
    names: string[];
    customPath?: string;
    basePath: string;
}): Promise<number> => {
    const query = new URLSearchParams(
        names.map((name) => ['names', name] as [string, string]),
    ).toString();
    const results = await lightdashApi<ApiSkillsAsCodeListResponse['results']>({
        method: 'GET',
        url: `/api/v1/aiAgents/skills/code${query ? `?${query}` : ''}`,
        body: undefined,
    });
    results.missingNames.forEach((name) =>
        GlobalState.log(styles.warning(`  ⚠ No skill named "${name}"`)),
    );
    await writeSkillFolders(basePath, results.skills, names.length === 0);
    GlobalState.debug(
        `Wrote ${results.skills.length} skills to ${getSkillsFolder(basePath)}${
            customPath ? ` (${customPath})` : ''
        }`,
    );
    return results.skills.length;
};

const addCounts = (
    changes: Record<string, number>,
    counts: Record<string, number>,
): Record<string, number> =>
    Object.entries(counts).reduce(
        (acc, [key, value]) =>
            value > 0 ? { ...acc, [key]: (acc[key] ?? 0) + value } : acc,
        changes,
    );

export const upsertSkills = async ({
    names,
    deleteNames,
    basePath,
    changes,
}: {
    names: string[];
    deleteNames: string[];
    basePath: string;
    changes: Record<string, number>;
}): Promise<Record<string, number>> => {
    const { skills, failures } = await readSkillFolders(basePath);
    failures.forEach((failure) =>
        GlobalState.log(styles.error(`  ✖ ${failure}`)),
    );
    const selected = names.length
        ? skills.filter((skill) => names.includes(skill.name))
        : skills;
    names
        .filter((name) => !skills.some((skill) => skill.name === name))
        .forEach((name) =>
            GlobalState.log(
                styles.warning(`  ⚠ No skill folder named "${name}"`),
            ),
        );
    // Same validator the editor and the API run, so a broken folder is
    // reported before the upload rather than by the server.
    const valid = selected.filter((skill) => {
        const result = validateAiAgentSkill({
            files: skill.files,
            folderName: skill.name,
        });
        result.errors.forEach((issue) =>
            GlobalState.log(
                styles.error(
                    `  ✖ ${SKILLS_FOLDER_NAME}/${skill.name}/${issue.path}: ${issue.message}`,
                ),
            ),
        );
        return result.valid;
    });
    const skippedInvalid = selected.length - valid.length;
    if (valid.length === 0 && deleteNames.length === 0) {
        return addCounts(changes, { 'Skills failed': skippedInvalid });
    }
    GlobalState.debug(`Uploading ${valid.length} skill folders`);
    let results: ApiSkillsAsCodeUpsertResponse['results'];
    try {
        results = await lightdashApi<ApiSkillsAsCodeUpsertResponse['results']>({
            method: 'POST',
            url: '/api/v1/aiAgents/skills/code',
            body: JSON.stringify({
                skills: valid,
                deleteNames,
            } satisfies ApiSkillsAsCodeUpsertRequest),
        });
    } catch (error) {
        throw new Error(`Could not upload skills: ${getErrorMessage(error)}`);
    }
    results.warnings.forEach((warning) =>
        GlobalState.log(styles.warning(`  ⚠ ${warning}`)),
    );
    results.failed.forEach(({ name, message }) =>
        GlobalState.log(styles.error(`  ✖ ${name}: ${message}`)),
    );
    return addCounts(changes, {
        'Skills created': results.created.length,
        'Skills updated': results.updated.length,
        'Skills skipped': results.unchanged.length,
        'Skills deleted': results.deleted.length,
        'Skills failed': results.failed.length + skippedInvalid,
    });
};
