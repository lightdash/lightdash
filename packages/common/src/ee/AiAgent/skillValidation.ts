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
    type AiAgentSkillFiles,
    type AiAgentSkillFrontmatter,
    type AiAgentSkillIssue,
    type AiAgentSkillIssueCode,
    type AiAgentSkillMetadata,
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

const REJECTED_FIELDS = new Set(['hooks']);

const AVAILABILITY_VALUES: AiAgentSkillAvailability[] = ['agent', 'mcp'];

// Claude Code's dynamic context injection: `!`cmd`` anywhere, or a fenced
// block opened with ```!. Both run shell before the model sees the body.
const SHELL_INJECTION_PATTERN = /!`[^`\n]+`|^```!/m;
const FILE_REFERENCE_PATTERN = /(^|\s)@[\w./-]+/m;
const ENV_VARIABLE_PATTERN = /\$\{CLAUDE_[A-Z_]+\}/;
const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n?---[ \t]*(?:\n|$)/;
const RESOURCE_PREFIX = `${AI_AGENT_SKILL_RESOURCES_DIR}/`;

type Frontmatter = { data: Record<string, unknown>; body: string };
type Issues = { errors: AiAgentSkillIssue[]; warnings: AiAgentSkillIssue[] };
type Parsed<T> = { value: T; issues: Issues };

const NO_ISSUES: Issues = { errors: [], warnings: [] };

const issue = (
    code: AiAgentSkillIssueCode,
    message: string,
    path: string,
): AiAgentSkillIssue => ({ code, message, path });

const errorsOnly = (...errors: AiAgentSkillIssue[]): Issues => ({
    errors,
    warnings: [],
});
const warningsOnly = (...warnings: AiAgentSkillIssue[]): Issues => ({
    errors: [],
    warnings,
});
const mergeIssues = (...parts: Issues[]): Issues => ({
    errors: parts.flatMap((part) => part.errors),
    warnings: parts.flatMap((part) => part.warnings),
});

const byteLength = (value: string): number =>
    new TextEncoder().encode(value).length;

const countLines = (text: string): number =>
    text.length === 0 ? 0 : text.replace(/\n$/, '').split('\n').length;

/** Null when the frontmatter block is malformed; absent frontmatter is fine. */
const splitFrontmatter = (raw: string): Frontmatter | null => {
    const normalized = raw.replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return { data: {}, body: normalized };
    }
    const match = FRONTMATTER_PATTERN.exec(normalized);
    if (match === null) {
        return null;
    }
    const body = normalized.slice(match[0].length);
    let data: unknown;
    try {
        data = yaml.load(match[1]);
    } catch (e) {
        return null;
    }
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

const asTrimmedString = (value: unknown): string | null =>
    asString(value)?.trim() || null;

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

const checkFilePaths = (files: AiAgentSkillFiles): Issues =>
    errorsOnly(
        ...Object.keys(files)
            .filter(
                (path) =>
                    path !== AI_AGENT_SKILL_FILE_NAME &&
                    (!path.startsWith(RESOURCE_PREFIX) ||
                        path.slice(RESOURCE_PREFIX.length).includes('/') ||
                        !path.endsWith('.md')),
            )
            .map((path) =>
                issue(
                    'resource_path_invalid',
                    `Only ${AI_AGENT_SKILL_FILE_NAME} and markdown files directly under ${AI_AGENT_SKILL_RESOURCES_DIR}/ are allowed.`,
                    path,
                ),
            ),
    );

const checkFrontmatterKeys = (data: Record<string, unknown>): Issues =>
    mergeIssues(
        ...Object.keys(data).map((key) => {
            if (REJECTED_FIELDS.has(key)) {
                return errorsOnly(
                    issue(
                        'field_rejected',
                        `\`${key}\` is not supported: Lightdash skills cannot register hooks or run commands.`,
                        AI_AGENT_SKILL_FILE_NAME,
                    ),
                );
            }
            if (!HONOURED_FIELDS.has(key)) {
                return warningsOnly(
                    issue(
                        'field_ignored',
                        `\`${key}\` is ignored: Lightdash skills run server-side with a fixed tool set.`,
                        AI_AGENT_SKILL_FILE_NAME,
                    ),
                );
            }
            return NO_ISSUES;
        }),
    );

const checkName = (
    name: string,
    reservedNames: string[],
    folderName: string | undefined,
): Issues => {
    if (name.length === 0) {
        return errorsOnly(
            issue(
                'name_missing',
                'The frontmatter needs a `name`.',
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    if (!isValidAiAgentSkillName(name)) {
        return errorsOnly(
            issue(
                'name_invalid',
                `\`name\` must be 1 to ${AI_AGENT_SKILL_NAME_MAX_LENGTH} lowercase letters, digits and single hyphens, and cannot start or end with a hyphen.`,
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    if (isReservedAiAgentSkillName(name, reservedNames)) {
        return errorsOnly(
            issue(
                'name_reserved',
                `\`${name}\` is reserved for Lightdash built-in skills.`,
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    if (folderName !== undefined && folderName !== name) {
        return errorsOnly(
            issue(
                'name_mismatch',
                `\`name\` (${name}) must match the skill folder name (${folderName}).`,
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    return NO_ISSUES;
};

const checkDescription = (description: string): Issues => {
    if (description.length === 0) {
        return errorsOnly(
            issue(
                'description_missing',
                'The frontmatter needs a `description`.',
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    if (description.length > AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH) {
        return errorsOnly(
            issue(
                'description_too_long',
                `\`description\` cannot exceed ${AI_AGENT_SKILL_DESCRIPTION_MAX_LENGTH} characters.`,
                AI_AGENT_SKILL_FILE_NAME,
            ),
        );
    }
    return NO_ISSUES;
};

const checkCompatibility = (compatibility: string | null): Issues =>
    compatibility !== null &&
    compatibility.length > AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH
        ? errorsOnly(
              issue(
                  'compatibility_too_long',
                  `\`compatibility\` cannot exceed ${AI_AGENT_SKILL_COMPATIBILITY_MAX_LENGTH} characters.`,
                  AI_AGENT_SKILL_FILE_NAME,
              ),
          )
        : NO_ISSUES;

const parseBoolean = (
    data: Record<string, unknown>,
    key: string,
    fallback: boolean,
): Parsed<boolean> => {
    if (data[key] === undefined) return { value: fallback, issues: NO_ISSUES };
    const parsed = asBoolean(data[key]);
    if (parsed === null) {
        return {
            value: fallback,
            issues: errorsOnly(
                issue(
                    'field_invalid',
                    `\`${key}\` must be true or false.`,
                    AI_AGENT_SKILL_FILE_NAME,
                ),
            ),
        };
    }
    return { value: parsed, issues: NO_ISSUES };
};

const parseArgumentNames = (
    data: Record<string, unknown>,
): Parsed<string[]> => {
    if (data.arguments === undefined) return { value: [], issues: NO_ISSUES };
    const names = asStringList(data.arguments);
    if (names === null) {
        return {
            value: [],
            issues: errorsOnly(
                issue(
                    'field_invalid',
                    '`arguments` must be a list of names or a space-separated string.',
                    AI_AGENT_SKILL_FILE_NAME,
                ),
            ),
        };
    }
    return { value: names, issues: NO_ISSUES };
};

const parseAvailability = (
    data: Record<string, unknown>,
): Parsed<AiAgentSkillAvailability[]> => {
    if (data.availability === undefined) {
        return { value: [...AVAILABILITY_VALUES], issues: NO_ISSUES };
    }
    const values = asStringList(data.availability);
    const isAvailability = (value: string): value is AiAgentSkillAvailability =>
        AVAILABILITY_VALUES.includes(value as AiAgentSkillAvailability);
    if (
        values === null ||
        values.length === 0 ||
        !values.every(isAvailability)
    ) {
        return {
            value: [...AVAILABILITY_VALUES],
            issues: errorsOnly(
                issue(
                    'field_invalid',
                    '`availability` must list `agent`, `mcp` or both.',
                    AI_AGENT_SKILL_FILE_NAME,
                ),
            ),
        };
    }
    return { value: values, issues: NO_ISSUES };
};

const parseMetadata = (
    data: Record<string, unknown>,
): Parsed<AiAgentSkillMetadata> => {
    if (data.metadata === undefined) return { value: {}, issues: NO_ISSUES };
    if (
        typeof data.metadata !== 'object' ||
        data.metadata === null ||
        Array.isArray(data.metadata)
    ) {
        return {
            value: {},
            issues: warningsOnly(
                issue(
                    'field_ignored',
                    '`metadata` is ignored because it is not a mapping.',
                    AI_AGENT_SKILL_FILE_NAME,
                ),
            ),
        };
    }
    return {
        value: Object.fromEntries(
            Object.entries(data.metadata as Record<string, unknown>).map(
                ([key, value]) => [key, String(value)],
            ),
        ),
        issues: NO_ISSUES,
    };
};

const checkBody = (
    path: string,
    text: string,
    kind: 'skill' | 'resource',
): Issues => {
    const maxBytes =
        kind === 'skill'
            ? AI_AGENT_SKILL_BODY_MAX_BYTES
            : AI_AGENT_SKILL_RESOURCE_MAX_BYTES;
    return mergeIssues(
        SHELL_INJECTION_PATTERN.test(text)
            ? errorsOnly(
                  issue(
                      'body_shell_injection',
                      'Shell command injection (!`command` or a ```! block) is not supported: Lightdash skills cannot run commands.',
                      path,
                  ),
              )
            : NO_ISSUES,
        FILE_REFERENCE_PATTERN.test(text)
            ? warningsOnly(
                  issue(
                      'body_file_reference',
                      '@path references are passed to the model as plain text; Lightdash skills have no filesystem.',
                      path,
                  ),
              )
            : NO_ISSUES,
        ENV_VARIABLE_PATTERN.test(text)
            ? warningsOnly(
                  issue(
                      'body_env_variable',
                      '${CLAUDE_*} variables are passed to the model as plain text.',
                      path,
                  ),
              )
            : NO_ISSUES,
        byteLength(text) > maxBytes
            ? errorsOnly(
                  issue(
                      kind === 'skill'
                          ? 'body_too_large'
                          : 'resource_too_large',
                      `${path} cannot exceed ${Math.round(maxBytes / 1024)}KB.`,
                      path,
                  ),
              )
            : NO_ISSUES,
        kind === 'skill' && countLines(text) > AI_AGENT_SKILL_BODY_WARN_LINES
            ? warningsOnly(
                  issue(
                      'body_too_long',
                      `The body is over ${AI_AGENT_SKILL_BODY_WARN_LINES} lines. Move detail into resources so the model loads less at once.`,
                      path,
                  ),
              )
            : NO_ISSUES,
    );
};

const parseResource = (
    path: string,
    raw: string,
): Parsed<AiAgentSkillParsedResource | null> => {
    const parsed = splitFrontmatter(raw);
    if (parsed === null) {
        return {
            value: null,
            issues: errorsOnly(
                issue(
                    'frontmatter_invalid',
                    'The resource frontmatter could not be parsed.',
                    path,
                ),
            ),
        };
    }
    const name = asTrimmedString(parsed.data.name);
    const description = asTrimmedString(parsed.data.description);
    if (name === null || description === null) {
        return {
            value: null,
            issues: errorsOnly(
                issue(
                    'frontmatter_invalid',
                    'Each resource needs `name` and `description` in its frontmatter.',
                    path,
                ),
            ),
        };
    }
    return {
        value: {
            fileName: path.slice(RESOURCE_PREFIX.length),
            name,
            description,
            body: parsed.body,
        },
        issues: checkBody(path, parsed.body, 'resource'),
    };
};

const parseResources = (
    files: AiAgentSkillFiles,
): Parsed<AiAgentSkillParsedResource[]> => {
    const paths = Object.keys(files)
        .filter((path) => path.startsWith(RESOURCE_PREFIX))
        .sort();
    const countIssues =
        paths.length > AI_AGENT_SKILL_MAX_RESOURCES
            ? errorsOnly(
                  issue(
                      'too_many_resources',
                      `A skill can have at most ${AI_AGENT_SKILL_MAX_RESOURCES} resources.`,
                      AI_AGENT_SKILL_RESOURCES_DIR,
                  ),
              )
            : NO_ISSUES;
    const parsed = paths.map((path) => parseResource(path, files[path]));
    return {
        value: parsed.flatMap((resource) =>
            resource.value === null ? [] : [resource.value],
        ),
        issues: mergeIssues(countIssues, ...parsed.map((r) => r.issues)),
    };
};

const checkTotalSize = (files: AiAgentSkillFiles): Issues =>
    Object.values(files).reduce((sum, text) => sum + byteLength(text), 0) >
    AI_AGENT_SKILL_MAX_TOTAL_BYTES
        ? errorsOnly(
              issue(
                  'skill_too_large',
                  `The whole skill cannot exceed ${Math.round(AI_AGENT_SKILL_MAX_TOTAL_BYTES / 1024)}KB.`,
                  AI_AGENT_SKILL_FILE_NAME,
              ),
          )
        : NO_ISSUES;

type ValidateArgs = {
    files: AiAgentSkillFiles;
    /** Built-in skill names; any collision is an error. */
    reservedNames?: string[];
    /** Folder the skill was read from; the frontmatter name must match it. */
    folderName?: string;
};

const invalid = (issues: Issues): AiAgentSkillValidationResult => ({
    valid: false,
    parsed: null,
    ...issues,
});

export const validateAiAgentSkill = ({
    files,
    reservedNames = [],
    folderName,
}: ValidateArgs): AiAgentSkillValidationResult => {
    const skillRaw = files[AI_AGENT_SKILL_FILE_NAME];
    if (typeof skillRaw !== 'string') {
        return invalid(
            errorsOnly(
                issue(
                    'skill_file_missing',
                    `A skill needs a ${AI_AGENT_SKILL_FILE_NAME} file.`,
                    AI_AGENT_SKILL_FILE_NAME,
                ),
            ),
        );
    }
    const pathIssues = checkFilePaths(files);
    const skillFrontmatter = splitFrontmatter(skillRaw);
    if (skillFrontmatter === null) {
        return invalid(
            mergeIssues(
                pathIssues,
                errorsOnly(
                    issue(
                        'frontmatter_invalid',
                        'The frontmatter could not be parsed. It must be a YAML mapping between two --- lines at the top of the file.',
                        AI_AGENT_SKILL_FILE_NAME,
                    ),
                ),
            ),
        );
    }
    const { data, body } = skillFrontmatter;
    const name = asTrimmedString(data.name) ?? '';
    const description = asTrimmedString(data.description) ?? '';
    const compatibility = asTrimmedString(data.compatibility);
    const argumentNames = parseArgumentNames(data);
    const disableModelInvocation = parseBoolean(
        data,
        'disable-model-invocation',
        false,
    );
    const userInvocable = parseBoolean(data, 'user-invocable', true);
    const availability = parseAvailability(data);
    const metadata = parseMetadata(data);
    const resources = parseResources(files);

    const issues = mergeIssues(
        pathIssues,
        checkFrontmatterKeys(data),
        checkName(name, reservedNames, folderName),
        checkDescription(description),
        checkCompatibility(compatibility),
        argumentNames.issues,
        disableModelInvocation.issues,
        userInvocable.issues,
        availability.issues,
        metadata.issues,
        checkBody(AI_AGENT_SKILL_FILE_NAME, body, 'skill'),
        resources.issues,
        checkTotalSize(files),
    );
    if (issues.errors.length > 0) {
        return invalid(issues);
    }

    const frontmatter: AiAgentSkillFrontmatter = {
        name,
        description,
        title: asTrimmedString(data.title),
        whenToUse: asTrimmedString(data.when_to_use),
        argumentHint: asTrimmedString(data['argument-hint']),
        arguments: argumentNames.value,
        disableModelInvocation: disableModelInvocation.value,
        userInvocable: userInvocable.value,
        availability: availability.value,
        metadata: metadata.value,
        license: asTrimmedString(data.license),
        compatibility,
    };
    return {
        valid: true,
        parsed: { frontmatter, body, resources: resources.value },
        errors: [],
        warnings: issues.warnings,
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

const tokenizeArguments = (input: string): string[] =>
    Array.from(
        input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g),
        (match) => match[1] ?? match[2] ?? match[3],
    );

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Claude Code substitution rules, applied in one pass so inserted text is never
 * re-expanded and unfilled placeholders stay literal.
 */
export const substituteAiAgentSkillArguments = (
    body: string,
    rawArguments: string,
    argumentNames: string[],
): string => {
    const trimmed = rawArguments.trim();
    const hasArguments = trimmed.length > 0;
    const tokens = hasArguments ? tokenizeArguments(trimmed) : [];
    const namedAlternative =
        argumentNames.length > 0
            ? `|\\$(?<named>${[...argumentNames]
                  .sort((a, b) => b.length - a.length)
                  .map(escapeRegExp)
                  .join('|')})(?![A-Za-z0-9_-])`
            : '';
    const pattern = new RegExp(
        `\\\\\\$|\\$ARGUMENTS\\[(?<indexed>\\d+)\\]|\\$ARGUMENTS|\\$(?<positional>\\d+)${namedAlternative}`,
        'g',
    );
    let received = false;
    const replaced = body.replace(pattern, (...args: unknown[]) => {
        const match = args[0] as string;
        const groups = (args[args.length - 1] ?? {}) as Partial<
            Record<'indexed' | 'positional' | 'named', string>
        >;
        if (match === '\\$') return '$';
        if (!hasArguments) return match;
        const index = groups.indexed ?? groups.positional;
        if (index !== undefined) {
            const token = tokens[Number(index)];
            if (token === undefined) return match;
            received = true;
            return token;
        }
        if (groups.named !== undefined) {
            received = true;
            return tokens[argumentNames.indexOf(groups.named)] ?? '';
        }
        received = true;
        return trimmed;
    });
    return hasArguments && !received
        ? `${replaced}\n\nARGUMENTS: ${trimmed}`
        : replaced;
};
