import * as yaml from 'js-yaml';
import {
    AI_AGENT_SKILL_BODY_MAX_BYTES,
    AI_AGENT_SKILL_BODY_WARN_LINES,
    AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH,
    AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH,
    AI_AGENT_SKILL_FILE_NAME,
    AI_AGENT_SKILL_MAX_RESOURCES,
    AI_AGENT_SKILL_MAX_TOTAL_BYTES,
    AI_AGENT_SKILL_NAME_MAX_LENGTH,
    AI_AGENT_SKILL_NAME_PATTERN,
    AI_AGENT_SKILL_RESERVED_NAME_PREFIX,
    AI_AGENT_SKILL_RESOURCE_MAX_BYTES,
    AI_AGENT_SKILL_RESOURCES_DIR,
    type AiAgentSkillAvailability,
    type AiAgentSkillFrontmatter,
    type AiAgentSkillIssue,
    type AiAgentSkillParsedResource,
    type AiAgentSkillValidationResult,
} from './skillTypes';

const HONOURED_FIELDS = new Set([
    'name',
    'description',
    'title',
    'when_to_use',
    'argument-hint',
    'arguments',
    'disable-model-invocation',
    'user-invocable',
    'availability',
    'metadata',
    'license',
    'compatibility',
]);

const IGNORED_FIELDS = new Set([
    'allowed-tools',
    'disallowed-tools',
    'model',
    'effort',
    'context',
    'agent',
    'background',
    'paths',
    'shell',
]);

const REJECTED_FIELDS = new Set(['hooks']);

const AVAILABILITY_VALUES: AiAgentSkillAvailability[] = ['agent', 'mcp'];

// Claude Code's dynamic context injection: `!`cmd`` after whitespace or a
// fenced block opened with ```!. Both run shell before the model sees the body.
const SHELL_INJECTION_PATTERN = /(^|\s)!`[^`]+`|^```!/m;
const FILE_REFERENCE_PATTERN = /(^|\s)@[\w./-]+/m;
const ENV_VARIABLE_PATTERN = /\$\{CLAUDE_[A-Z_]+\}/;

type Frontmatter = { data: Record<string, unknown>; body: string };

const byteLength = (value: string): number =>
    new TextEncoder().encode(value).length;

const splitFrontmatter = (raw: string): Frontmatter | null => {
    const normalized = raw.replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return { data: {}, body: normalized };
    }
    const end = normalized.indexOf('\n---', 4);
    if (end === -1) {
        return null;
    }
    const yamlText = normalized.slice(4, end);
    const body = normalized.slice(end + 4).replace(/^\n/, '');
    const data = yaml.load(yamlText);
    if (data === undefined || data === null) {
        return { data: {}, body };
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
        return null;
    }
    return { data: data as Record<string, unknown>, body };
};

const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const asBoolean = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lowered = value.trim().toLowerCase();
        if (['true', 'yes', 'on', '1'].includes(lowered)) return true;
        if (['false', 'no', 'off', '0'].includes(lowered)) return false;
    }
    if (typeof value === 'number') return value !== 0;
    return null;
};

const asStringList = (value: unknown): string[] | null => {
    if (typeof value === 'string') {
        return value.split(/[\s,]+/).filter((item) => item.length > 0);
    }
    if (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
    ) {
        return value;
    }
    return null;
};

export const isValidAiAgentSkillName = (name: string): boolean =>
    name.length > 0 &&
    name.length <= AI_AGENT_SKILL_NAME_MAX_LENGTH &&
    AI_AGENT_SKILL_NAME_PATTERN.test(name);

export const isReservedAiAgentSkillName = (
    name: string,
    reservedNames: string[],
): boolean =>
    name.startsWith(AI_AGENT_SKILL_RESERVED_NAME_PREFIX) ||
    reservedNames.includes(name);

/** Derive a valid skill name from a free-text title, for the create form. */
export const suggestAiAgentSkillName = (title: string): string =>
    title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, AI_AGENT_SKILL_NAME_MAX_LENGTH)
        .replace(/-+$/g, '');

type ValidateArgs = {
    files: Record<string, string>;
    /** Built-in skill names; any collision is an error. */
    reservedNames?: string[];
    /**
     * Folder name the skill was read from, when known. The frontmatter name
     * must match it, per the agentskills.io specification.
     */
    folderName?: string;
};

export const validateAiAgentSkill = ({
    files,
    reservedNames = [],
    folderName,
}: ValidateArgs): AiAgentSkillValidationResult => {
    const errors: AiAgentSkillIssue[] = [];
    const warnings: AiAgentSkillIssue[] = [];
    const error = (issue: AiAgentSkillIssue) => errors.push(issue);
    const warn = (issue: AiAgentSkillIssue) => warnings.push(issue);
    const fail = (): AiAgentSkillValidationResult => ({
        valid: false,
        parsed: null,
        errors,
        warnings,
    });

    const skillRaw = files[AI_AGENT_SKILL_FILE_NAME];
    if (typeof skillRaw !== 'string') {
        error({
            code: 'skill_file_missing',
            message: `A skill needs a ${AI_AGENT_SKILL_FILE_NAME} file.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
        return fail();
    }

    const resourcePrefix = `${AI_AGENT_SKILL_RESOURCES_DIR}/`;
    Object.keys(files).forEach((path) => {
        if (path === AI_AGENT_SKILL_FILE_NAME) return;
        if (
            !path.startsWith(resourcePrefix) ||
            path.slice(resourcePrefix.length).includes('/') ||
            !path.endsWith('.md')
        ) {
            error({
                code: 'resource_path_invalid',
                message: `Only ${AI_AGENT_SKILL_FILE_NAME} and markdown files directly under ${AI_AGENT_SKILL_RESOURCES_DIR}/ are allowed.`,
                path,
            });
        }
    });

    let skillFrontmatter: Frontmatter | null;
    try {
        skillFrontmatter = splitFrontmatter(skillRaw);
    } catch (e) {
        skillFrontmatter = null;
    }
    if (skillFrontmatter === null) {
        error({
            code: 'frontmatter_invalid',
            message:
                'The frontmatter could not be parsed. It must be a YAML mapping between two --- lines at the top of the file.',
            path: AI_AGENT_SKILL_FILE_NAME,
        });
        return fail();
    }
    const { data, body } = skillFrontmatter;

    Object.keys(data).forEach((key) => {
        if (REJECTED_FIELDS.has(key)) {
            error({
                code: 'field_rejected',
                message: `\`${key}\` is not supported: Lightdash skills cannot register hooks or run commands.`,
                path: AI_AGENT_SKILL_FILE_NAME,
            });
        } else if (IGNORED_FIELDS.has(key) || !HONOURED_FIELDS.has(key)) {
            warn({
                code: 'field_ignored',
                message: `\`${key}\` is ignored: Lightdash skills run server-side with a fixed tool set.`,
                path: AI_AGENT_SKILL_FILE_NAME,
            });
        }
    });

    const name = asString(data.name)?.trim() ?? '';
    if (name.length === 0) {
        error({
            code: 'name_missing',
            message: 'The frontmatter needs a `name`.',
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    } else if (!isValidAiAgentSkillName(name)) {
        error({
            code: 'name_invalid',
            message: `\`name\` must be 1 to ${AI_AGENT_SKILL_NAME_MAX_LENGTH} lowercase letters, digits and single hyphens, and cannot start or end with a hyphen.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    } else if (isReservedAiAgentSkillName(name, reservedNames)) {
        error({
            code: 'name_reserved',
            message: `\`${name}\` is reserved for Lightdash built-in skills.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    } else if (folderName !== undefined && folderName !== name) {
        error({
            code: 'name_mismatch',
            message: `\`name\` (${name}) must match the skill folder name (${folderName}).`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    }

    const description = asString(data.description)?.trim() ?? '';
    if (description.length === 0) {
        error({
            code: 'description_missing',
            message: 'The frontmatter needs a `description`.',
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    } else if (description.length > AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH) {
        error({
            code: 'description_too_long',
            message: `\`description\` cannot exceed ${AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH} characters.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    }

    const compatibility = asString(data.compatibility);
    if (
        compatibility !== null &&
        compatibility.length > AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH
    ) {
        error({
            code: 'compatibility_too_long',
            message: `\`compatibility\` cannot exceed ${AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH} characters.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    }

    const readBoolean = (key: string, fallback: boolean): boolean => {
        if (data[key] === undefined) return fallback;
        const parsed = asBoolean(data[key]);
        if (parsed === null) {
            error({
                code: 'field_invalid',
                message: `\`${key}\` must be true or false.`,
                path: AI_AGENT_SKILL_FILE_NAME,
            });
            return fallback;
        }
        return parsed;
    };

    const argumentNames =
        data.arguments === undefined ? [] : asStringList(data.arguments);
    if (argumentNames === null) {
        error({
            code: 'field_invalid',
            message:
                '`arguments` must be a list of names or a space-separated string.',
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    }

    let availability: AiAgentSkillAvailability[] = [...AVAILABILITY_VALUES];
    if (data.availability !== undefined) {
        const values = asStringList(data.availability);
        if (
            values === null ||
            values.length === 0 ||
            !values.every((value) =>
                AVAILABILITY_VALUES.includes(value as AiAgentSkillAvailability),
            )
        ) {
            error({
                code: 'field_invalid',
                message: '`availability` must list `agent`, `mcp` or both.',
                path: AI_AGENT_SKILL_FILE_NAME,
            });
        } else {
            availability = values as AiAgentSkillAvailability[];
        }
    }

    let metadata: Record<string, string> = {};
    if (data.metadata !== undefined) {
        if (
            typeof data.metadata === 'object' &&
            data.metadata !== null &&
            !Array.isArray(data.metadata)
        ) {
            metadata = Object.fromEntries(
                Object.entries(data.metadata as Record<string, unknown>).map(
                    ([key, value]) => [key, String(value)],
                ),
            );
        } else {
            warn({
                code: 'field_ignored',
                message: '`metadata` is ignored because it is not a mapping.',
                path: AI_AGENT_SKILL_FILE_NAME,
            });
        }
    }

    const checkBody = (path: string, text: string, isSkill: boolean) => {
        if (SHELL_INJECTION_PATTERN.test(text)) {
            error({
                code: 'body_shell_injection',
                message:
                    'Shell command injection (!`command` or a ```! block) is not supported: Lightdash skills cannot run commands.',
                path,
            });
        }
        if (FILE_REFERENCE_PATTERN.test(text)) {
            warn({
                code: 'body_file_reference',
                message:
                    '@path references are passed to the model as plain text; Lightdash skills have no filesystem.',
                path,
            });
        }
        if (ENV_VARIABLE_PATTERN.test(text)) {
            warn({
                code: 'body_env_variable',
                message:
                    '${CLAUDE_*} variables are passed to the model as plain text.',
                path,
            });
        }
        const maxBytes = isSkill
            ? AI_AGENT_SKILL_BODY_MAX_BYTES
            : AI_AGENT_SKILL_RESOURCE_MAX_BYTES;
        if (byteLength(text) > maxBytes) {
            error({
                code: isSkill ? 'body_too_large' : 'resource_too_large',
                message: `${path} cannot exceed ${Math.round(maxBytes / 1024)}KB.`,
                path,
            });
        }
        if (
            isSkill &&
            text.split('\n').length > AI_AGENT_SKILL_BODY_WARN_LINES
        ) {
            warn({
                code: 'body_too_long',
                message: `The body is over ${AI_AGENT_SKILL_BODY_WARN_LINES} lines. Move detail into resources so the model loads less at once.`,
                path,
            });
        }
    };
    checkBody(AI_AGENT_SKILL_FILE_NAME, body, true);

    const resourcePaths = Object.keys(files)
        .filter((path) => path.startsWith(resourcePrefix))
        .sort();
    if (resourcePaths.length > AI_AGENT_SKILL_MAX_RESOURCES) {
        error({
            code: 'too_many_resources',
            message: `A skill can have at most ${AI_AGENT_SKILL_MAX_RESOURCES} resources.`,
            path: AI_AGENT_SKILL_RESOURCES_DIR,
        });
    }
    const resources: AiAgentSkillParsedResource[] = [];
    resourcePaths.forEach((path) => {
        let parsedResource: Frontmatter | null;
        try {
            parsedResource = splitFrontmatter(files[path]);
        } catch (e) {
            parsedResource = null;
        }
        if (parsedResource === null) {
            error({
                code: 'frontmatter_invalid',
                message: 'The resource frontmatter could not be parsed.',
                path,
            });
            return;
        }
        const resourceName = asString(parsedResource.data.name)?.trim() ?? '';
        const resourceDescription =
            asString(parsedResource.data.description)?.trim() ?? '';
        if (resourceName.length === 0 || resourceDescription.length === 0) {
            error({
                code: 'frontmatter_invalid',
                message:
                    'Each resource needs `name` and `description` in its frontmatter.',
                path,
            });
            return;
        }
        checkBody(path, parsedResource.body, false);
        resources.push({
            fileName: path.slice(resourcePrefix.length),
            name: resourceName,
            description: resourceDescription,
            body: parsedResource.body,
        });
    });

    const totalBytes = Object.values(files).reduce(
        (sum, text) => sum + byteLength(text),
        0,
    );
    if (totalBytes > AI_AGENT_SKILL_MAX_TOTAL_BYTES) {
        error({
            code: 'skill_too_large',
            message: `The whole skill cannot exceed ${Math.round(AI_AGENT_SKILL_MAX_TOTAL_BYTES / 1024)}KB.`,
            path: AI_AGENT_SKILL_FILE_NAME,
        });
    }

    if (errors.length > 0) {
        return fail();
    }

    const frontmatter: AiAgentSkillFrontmatter = {
        name,
        description,
        title: asString(data.title)?.trim() || null,
        whenToUse: asString(data.when_to_use)?.trim() || null,
        argumentHint: asString(data['argument-hint'])?.trim() || null,
        arguments: argumentNames ?? [],
        disableModelInvocation: readBoolean('disable-model-invocation', false),
        userInvocable: readBoolean('user-invocable', true),
        availability,
        metadata,
        license: asString(data.license)?.trim() || null,
        compatibility: compatibility?.trim() || null,
    };

    return {
        valid: true,
        parsed: { frontmatter, body, resources },
        errors: [],
        warnings,
    };
};

/** The prompt-listing text: description plus when_to_use, capped like Claude Code's listing. */
export const getAiAgentSkillListingText = (
    frontmatter: Pick<AiAgentSkillFrontmatter, 'description' | 'whenToUse'>,
    maxChars: number,
): string => {
    const text = frontmatter.whenToUse
        ? `${frontmatter.description} ${frontmatter.whenToUse}`
        : frontmatter.description;
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
};

const tokenizeArguments = (input: string): string[] => {
    const tokens: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match = pattern.exec(input);
    while (match !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
        match = pattern.exec(input);
    }
    return tokens;
};

/**
 * Substitute slash-command arguments into a skill body following the Claude
 * Code rules: `$ARGUMENTS` takes the whole string, `$ARGUMENTS[N]` and `$N`
 * take shell-style tokens, `$name` takes the declared position. When arguments
 * are given and no placeholder received one, `ARGUMENTS: <input>` is appended.
 */
export const substituteAiAgentSkillArguments = (
    body: string,
    rawArguments: string,
    argumentNames: string[],
): string => {
    const trimmed = rawArguments.trim();
    if (trimmed.length === 0) {
        return body;
    }
    const tokens = tokenizeArguments(trimmed);
    let received = false;
    const replaced = body
        .replace(/\\\$/g, '\u0000')
        .replace(/\$ARGUMENTS\[(\d+)\]/g, (match, index: string) => {
            const token = tokens[Number(index)];
            if (token === undefined) return match;
            received = true;
            return token;
        })
        .replace(/\$ARGUMENTS/g, () => {
            received = true;
            return trimmed;
        })
        .replace(/\$(\d+)/g, (match, index: string) => {
            const token = tokens[Number(index)];
            if (token === undefined) return match;
            received = true;
            return token;
        })
        .replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, argName: string) => {
            const position = argumentNames.indexOf(argName);
            if (position === -1) return match;
            received = true;
            return tokens[position] ?? '';
        })
        .replace(/\u0000/g, '$');
    return received ? replaced : `${replaced}\n\nARGUMENTS: ${trimmed}`;
};
