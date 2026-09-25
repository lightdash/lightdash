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

// dbt-duckdb hands `config_options` to duckdb.connect() and runs `settings`
// as SET statements once the connection is open. DuckDB refuses to change
// access_mode or enable_external_access on a running database (so under
// `settings` they would abort every command that opens a connection) and
// refuses to set disabled_filesystems before the database has started, so
// each option has exactly one place it works. Together they stop a dbt
// command from writing to the shared playground database or reading and
// writing arbitrary files on the host through read_csv, COPY TO or ATTACH.
export const renderProfiles = (databasePath: string): string => `jaffle_shop:
  target: jaffle
  outputs:
    jaffle:
      type: duckdb
      path: ${databasePath}
      schema: jaffle
      threads: 1
      config_options:
        access_mode: READ_ONLY
        enable_external_access: false
      settings:
        disabled_filesystems: LocalFileSystem
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
