import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type LearnBundle = {
    version: 1;
    files: { path: string; content: string }[];
};
const BUNDLE_PATH = path.resolve(
    __dirname,
    '../../../assets/learn/jaffle-dbt.json',
);
let cached: Promise<LearnBundle> | undefined;

export const loadLearnBundle = (): Promise<LearnBundle> => {
    if (!cached) {
        cached = readFile(BUNDLE_PATH, 'utf8').then(
            (s) => JSON.parse(s) as LearnBundle,
        );
    }
    return cached;
};

const EDITABLE = /^models\/(?:[^/\0]+\/)*[^/\0]+\.yml$/;
export const isEditablePath = (p: string): boolean =>
    EDITABLE.test(p) && !p.split('/').includes('..');

export const validateYaml = (content: string): string | null => {
    try {
        parseYaml(content);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : 'Invalid YAML';
    }
};

export const renderProfiles = (databasePath: string): string => `jaffle_shop:
  target: jaffle
  outputs:
    jaffle:
      type: duckdb
      path: ${databasePath}
      schema: jaffle
      threads: 1
      settings:
        access_mode: READ_ONLY
        memory_limit: 256MB
`;

const isUnsafeBundlePath = (relative: string): boolean =>
    relative.startsWith('/') || relative.split('/').includes('..');

export const materialiseWorkspace = async (args: {
    bundle: LearnBundle;
    overlay: { path: string; content: string }[];
    workspaceDir: string;
    profiles: { databasePath: string };
}): Promise<void> => {
    const projectDir = path.join(args.workspaceDir, 'project');
    const write = async (relative: string, content: string) => {
        const target = path.join(projectDir, ...relative.split('/'));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
    };
    for (const file of args.bundle.files) {
        if (isUnsafeBundlePath(file.path)) {
            throw new Error(
                `Refusing to materialise unsafe bundle path: ${file.path}`,
            );
        }
        // eslint-disable-next-line no-await-in-loop
        await write(file.path, file.content);
    }
    for (const file of args.overlay) {
        if (!isEditablePath(file.path)) {
            throw new Error(
                `Refusing to materialise non-editable overlay path: ${file.path}`,
            );
        }
        // eslint-disable-next-line no-await-in-loop
        await write(file.path, file.content);
    }
    await writeFile(
        path.join(args.workspaceDir, 'profiles.yml'),
        renderProfiles(args.profiles.databasePath),
    );
};
