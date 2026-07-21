import { type AgentOnboardingStage } from '@lightdash/common';
import {
    CLAUDE_SKILLS_DIR,
    CLI_WRAPPER_PATH,
    MAX_ONBOARDING_FILE_COUNT,
    MAX_ONBOARDING_FILE_SIZE_BYTES,
    MAX_ONBOARDING_TOTAL_SIZE_BYTES,
    PROMPT_PATH,
    WORKDIR,
} from './constants';

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LIGHTDASH_COMMAND_PATTERN = new RegExp(
    `(?:^|[\\s;&|()])(?:lightdash|${escapeRegExp(
        CLI_WRAPPER_PATH,
    )})\\s+([\\w-]+)`,
);

type BuildManagedOnboardingPromptArgs = {
    basePrompt: string;
    siteUrl: string;
    projectUuid: string;
    warehouseType: string;
    database: string | undefined;
    schema: string | undefined;
};

export const buildManagedOnboardingPrompt = (
    args: BuildManagedOnboardingPromptArgs,
): string => {
    const preamble = [
        '# Lightdash cloud onboarding run',
        '',
        'You are running inside a managed sandbox on Lightdash Cloud, completing project setup on behalf of a user.',
        '',
        '## Context',
        `- Lightdash instance URL: ${args.siteUrl}`,
        `- Warehouse type: ${args.warehouseType}`,
        `- Prepared project UUID: ${args.projectUuid}`,
        ...(args.database ? [`- Configured database: ${args.database}`] : []),
        ...(args.schema ? [`- Configured schema: ${args.schema}`] : []),
        '',
        '## Environment overrides (IMPORTANT — these replace section 1 of the instructions below)',
        '- The Lightdash CLI and skills are preinstalled. Skip section 1 entirely.',
        `- Run every \`lightdash <args>\` command as \`${CLI_WRAPPER_PATH} <args>\` (a thin wrapper around the same CLI).`,
        '- Run each wrapper invocation as a single direct command. Do not use pipes, redirects, command chaining, command substitution, or environment expansion.',
        `- \`warehouse-catalog\` prints its result directly and does not accept \`-o\`. For \`sql\`, always use \`-o ${WORKDIR}/<descriptive-name>.csv\`; no other output extension is permitted.`,
        '- Authentication is already configured through environment variables (LIGHTDASH_URL, LIGHTDASH_API_KEY, LIGHTDASH_PROJECT). Do NOT run `lightdash login`.',
        `- For section 1, verify the selected project with \`${CLI_WRAPPER_PATH} config get-project\` and confirm it matches the prepared project UUID, then continue from section 2.`,
        `- There is no existing repository. Create all working files under ${WORKDIR} and build a pure Lightdash semantic layer from the warehouse catalog.`,
        '- The standard Lightdash models, charts, and dashboards directories are already prepared.',
        '- Temporary CSV profiling files are excluded from persistence and do not need manual cleanup.',
        '',
        '---',
        '',
    ].join('\n');

    return preamble + args.basePrompt;
};

const normalizeToolPath = (path: string): string =>
    path
        .replaceAll('\\', '/')
        .replace(WORKDIR, '')
        .replace(/^\.?\/+/, '');

const classifyCliStage = (command: string): AgentOnboardingStage | null => {
    if (/\s--help(?:\s|$)/.test(command)) return null;

    const subcommand = command.match(LIGHTDASH_COMMAND_PATTERN)?.[1];
    switch (subcommand) {
        case 'config':
            return /\b(set-project|rename-project|get-project)\b/.test(command)
                ? 'preparing_project'
                : null;
        case 'warehouse-catalog':
        case 'sql':
            return 'exploring_warehouse';
        case 'deploy':
            return 'deploying_semantic_layer';
        case 'run-chart':
        case 'upload':
            return 'building_dashboard';
        case 'validate':
        case 'download':
            return 'verifying';
        default:
            return null;
    }
};

export const classifyOnboardingStage = (
    toolName: string,
    input: unknown,
): AgentOnboardingStage | null => {
    const fields =
        input && typeof input === 'object'
            ? (input as Record<string, unknown>)
            : {};

    if (toolName === 'Bash') {
        return typeof fields.command === 'string'
            ? classifyCliStage(fields.command)
            : null;
    }
    if (toolName !== 'Write' && toolName !== 'Edit') return null;

    const path =
        typeof fields.file_path === 'string'
            ? normalizeToolPath(fields.file_path)
            : '';
    const content = typeof fields.content === 'string' ? fields.content : '';

    if (
        /(^|\/)lightdash\/(charts|dashboards)\//.test(path) ||
        /(^|\/)lightdash\/agent-starter-.*\.ya?ml$/.test(path) ||
        /^contentType:\s*(chart|dashboard)\s*$/m.test(content)
    ) {
        return 'building_dashboard';
    }

    if (
        /(^|\/)(models|macros|analyses|seeds|snapshots)\//.test(path) ||
        /(^|\/)(dbt_project|lightdash\.config|packages|dependencies)\.ya?ml$/.test(
            path,
        )
    ) {
        return 'deploying_semantic_layer';
    }

    return null;
};

export const sanitizeOnboardingMessage = (
    message: string,
    sensitiveValues: string[] = [],
): string => {
    const redacted = sensitiveValues
        .filter(Boolean)
        .reduce(
            (result, value) => result.replaceAll(value, '[REDACTED]'),
            message,
        );

    return redacted
        .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED]@')
        .replace(/\bldpat_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
        .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED]')
        .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED]')
        .replace(
            /\bgl(?:pat|oas|ptt|rt|cbt|soat)-[A-Za-z0-9_-]{20,}\b/g,
            '[REDACTED]',
        )
        .replaceAll(`${CLI_WRAPPER_PATH} `, 'lightdash ')
        .replaceAll(CLI_WRAPPER_PATH, 'lightdash')
        .replaceAll(`${WORKDIR}/`, '')
        .replaceAll(WORKDIR, '.')
        .replaceAll(PROMPT_PATH, 'the onboarding prompt')
        .replaceAll(CLAUDE_SKILLS_DIR, 'the onboarding skills directory')
        .replace(
            /(^|[\s("'`])\/(?:home\/user|tmp|var\/tmp|root)(?:\/[^\s)"'`]*)?/g,
            '$1[sandbox path]',
        );
};

export type WorkspaceFileEntry = {
    path: string;
    sizeBytes: number;
    updatedAt: string;
};

export const validateOnboardingOutputFileLimits = (
    files: WorkspaceFileEntry[],
): void => {
    if (files.length > MAX_ONBOARDING_FILE_COUNT) {
        throw new Error(
            `The onboarding agent generated more than ${MAX_ONBOARDING_FILE_COUNT} files`,
        );
    }

    const oversizedFile = files.find(
        ({ sizeBytes }) => sizeBytes > MAX_ONBOARDING_FILE_SIZE_BYTES,
    );
    if (oversizedFile) {
        throw new Error(
            `Onboarding file ${oversizedFile.path} exceeds the ${MAX_ONBOARDING_FILE_SIZE_BYTES} byte limit`,
        );
    }

    const totalSizeBytes = files.reduce(
        (total, { sizeBytes }) => total + sizeBytes,
        0,
    );
    if (totalSizeBytes > MAX_ONBOARDING_TOTAL_SIZE_BYTES) {
        throw new Error(
            `Onboarding files exceed the ${MAX_ONBOARDING_TOTAL_SIZE_BYTES} byte total limit`,
        );
    }
};

export const containsOnboardingSecret = (
    contents: Buffer,
    sensitiveValues: string[],
): boolean => {
    const text = contents.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(contents)) return true;
    if (
        sensitiveValues.some(
            (value) =>
                value.length > 0 && contents.includes(Buffer.from(value)),
        )
    ) {
        return true;
    }

    return [
        /\bldpat_[A-Za-z0-9_-]+\b/,
        /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
        /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
        /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
        /\bgl(?:pat|oas|ptt|rt|cbt|soat)-[A-Za-z0-9_-]{20,}\b/,
        /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
    ].some((pattern) => pattern.test(text));
};

export const isOnboardingOutputFile = (path: string): boolean => {
    const segments = path.split('/');
    if (
        path.startsWith('/') ||
        path.includes('\\') ||
        path.includes('\0') ||
        segments.some(
            (segment) => !segment || segment === '.' || segment === '..',
        )
    ) {
        return false;
    }
    return (
        /^lightdash\.config\.ya?ml$/.test(path) ||
        /^lightdash\/.+\.ya?ml$/.test(path) ||
        /^LIGHTDASH_(?:ONBOARDING_)?HANDOFF(?:_\d{4}-\d{2}-\d{2}(?:-\d+)?)?\.md$/.test(
            path,
        )
    );
};

export const hasCompleteOnboardingOutput = (
    files: Array<{ path: string }>,
): boolean =>
    [
        /^lightdash\.config\.ya?ml$/,
        /^lightdash\/models\/.+\.ya?ml$/,
        /^LIGHTDASH_(?:ONBOARDING_)?HANDOFF(?:_\d{4}-\d{2}-\d{2}(?:-\d+)?)?\.md$/,
    ].every((pattern) => files.some(({ path }) => pattern.test(path)));

export const parseWorkspaceFileListing = (
    listing: string,
): WorkspaceFileEntry[] =>
    listing
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
            const fields = line.split('\t');
            if (fields.length < 3) return [];
            const modifiedAt = Number(fields.pop());
            const sizeBytes = Number(fields.pop());
            const path = fields.join('\t');
            const updatedAtMs = Math.floor(modifiedAt * 1000);
            if (
                !path ||
                path.startsWith('/') ||
                path.split('/').includes('..') ||
                !Number.isFinite(sizeBytes) ||
                sizeBytes < 0 ||
                !Number.isFinite(updatedAtMs)
            ) {
                return [];
            }
            return [
                {
                    path,
                    sizeBytes,
                    updatedAt: new Date(updatedAtMs).toISOString(),
                },
            ];
        });
