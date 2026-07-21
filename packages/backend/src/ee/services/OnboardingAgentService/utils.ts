import { type AgentOnboardingStage } from '@lightdash/common';
import {
    CLAUDE_SKILLS_DIR,
    CLI_WRAPPER_PATH,
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
