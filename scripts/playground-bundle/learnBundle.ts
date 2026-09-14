import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type LearnBundleFile = { path: string; content: string };
export type LearnBundle = { version: 1; files: LearnBundleFile[] };

const ROOT_FILES = new Set([
    'dbt_project.yml',
    'lightdash.config.yml',
    'LICENSE',
]);
const INCLUDED_DIRECTORIES = new Set(['models', 'macros', 'data']);
const INCLUDED_EXTENSIONS = new Set(['.sql', '.yml', '.yaml', '.md', '.csv']);

/** Files a learner workspace needs to parse and compile; nothing that runs. */
export const isLearnBundlePath = (relativePath: string): boolean => {
    const segments = relativePath.split('/');
    if (segments.length === 1) return ROOT_FILES.has(relativePath);
    if (!INCLUDED_DIRECTORIES.has(segments[0])) return false;
    return INCLUDED_EXTENSIONS.has(path.posix.extname(relativePath));
};

/** Seeds exist in the workspace so dbt can resolve ref(); the data lives in DuckDB. */
export const truncateCsvToHeader = (content: string): string => {
    if (content === '') return '';
    const [header] = content.split(/\r?\n/, 1);
    return `${header}\n`;
};

// Symlinked entries are neither a directory nor a file under `withFileTypes`,
// so they are deliberately skipped rather than followed.
const walk = async (root: string, directory: string): Promise<string[]> => {
    const entries = await readdir(path.join(root, directory), {
        withFileTypes: true,
    });
    const files: string[] = [];
    for (const entry of entries) {
        const relative = directory ? `${directory}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            files.push(...(await walk(root, relative)));
        } else if (entry.isFile()) {
            files.push(relative);
        }
    }
    return files;
};

export const collectLearnBundle = async (
    projectDir: string,
): Promise<LearnBundle> => {
    const candidates = (await walk(projectDir, '')).filter(isLearnBundlePath);
    candidates.sort();
    const files = await Promise.all(
        candidates.map(async (relativePath) => {
            const raw = await readFile(
                path.join(projectDir, ...relativePath.split('/')),
                'utf8',
            );
            const content =
                path.posix.extname(relativePath) === '.csv'
                    ? truncateCsvToHeader(raw)
                    : raw;
            return { path: relativePath, content };
        }),
    );
    return { version: 1, files };
};

export const serializeLearnBundle = (bundle: LearnBundle): string =>
    `${JSON.stringify(bundle)}\n`;
