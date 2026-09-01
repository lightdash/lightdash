import { type TemplateQuestion } from './templates';

/**
 * Org-scoped data app template packages.
 *
 * A template package is an app directory in the apps-as-code layout, packed as
 * a tar: the authored `src/` tree (which must contain `src/template.json`, the
 * manifest holding the fluid parts of the app) plus an optional `AGENTS.md`
 * carrying the template's guardrails. Scaffold-owned files never travel: the
 * sandbox image provides them. Uploaded with
 * `lightdash upload --apps <slug> --as-template`, stored per organization, and
 * seeded into the sandbox when a user creates an app from the template.
 */
export const DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE = 'application/x-tar';
export const DATA_APP_TEMPLATE_MANIFEST_PATH = 'src/template.json';
export const DATA_APP_TEMPLATE_GUARDRAILS_PATH = 'AGENTS.md';
export const MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DATA_APP_TEMPLATE_FILE_BYTES = 1024 * 1024;
export const MAX_DATA_APP_TEMPLATE_FILES = 200;
export const DATA_APP_TEMPLATE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const MAX_CATEGORY_LENGTH = 40;
const MAX_QUESTIONS = 12;

export type DataAppTemplateManifest = {
    templateVersion: 1;
    template: {
        id: string;
        name: string;
        description: string;
        category: string;
    };
    questions?: TemplateQuestion[];
};

export type DataAppTemplateSummary = {
    templateUuid: string;
    organizationUuid: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    questions: TemplateQuestion[];
    fileCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export type DataAppTemplateImportResult = DataAppTemplateSummary & {
    action: 'created' | 'updated';
};

export type ApiDataAppTemplatesResponse = {
    status: 'ok';
    results: DataAppTemplateSummary[];
};

export type ApiDataAppTemplateResponse = {
    status: 'ok';
    results: DataAppTemplateSummary;
};

export type ApiDataAppTemplateImportResponse = {
    status: 'ok';
    results: DataAppTemplateImportResult;
};

export class DataAppTemplatePackageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DataAppTemplatePackageError';
    }
}

/**
 * Only authored files travel in a package: the `src/` tree and the
 * guardrails file. Everything else in an app directory is scaffold, build
 * output, or tooling and is rejected so a package can never smuggle config.
 */
export const validateDataAppTemplateEntryPath = (entryPath: string): string => {
    const normalized = entryPath.replace(/^\.\//, '');
    if (normalized.length === 0 || normalized.length > 512) {
        throw new DataAppTemplatePackageError(
            `Invalid package entry path "${entryPath}"`,
        );
    }
    if (
        normalized.startsWith('/') ||
        normalized.includes('\\') ||
        normalized
            .split('/')
            .some((segment) => segment === '..' || segment === '')
    ) {
        throw new DataAppTemplatePackageError(
            `Package entry path "${entryPath}" must be relative and must not traverse directories`,
        );
    }
    if (normalized.includes('node_modules/')) {
        throw new DataAppTemplatePackageError(
            `Package entry path "${entryPath}" must not include node_modules`,
        );
    }
    if (
        normalized !== DATA_APP_TEMPLATE_GUARDRAILS_PATH &&
        !normalized.startsWith('src/')
    ) {
        throw new DataAppTemplatePackageError(
            `Package entry path "${entryPath}" is not allowed: only src/ files and ${DATA_APP_TEMPLATE_GUARDRAILS_PATH} belong in a template package`,
        );
    }
    return normalized;
};

const requireString = (
    value: unknown,
    field: string,
    maxLength: number,
): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: ${field} is required`,
        );
    }
    if (value.length > maxLength) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: ${field} must be at most ${maxLength} characters`,
        );
    }
    return value.trim();
};

const parseQuestions = (value: unknown): TemplateQuestion[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: questions must be an array`,
        );
    }
    if (value.length > MAX_QUESTIONS) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: at most ${MAX_QUESTIONS} questions are allowed`,
        );
    }
    const keys = new Set<string>();
    return value.map((raw, index) => {
        if (typeof raw !== 'object' || raw === null) {
            throw new DataAppTemplatePackageError(
                `${DATA_APP_TEMPLATE_MANIFEST_PATH}: questions[${index}] must be an object`,
            );
        }
        const q = raw as Record<string, unknown>;
        const key = requireString(q.key, `questions[${index}].key`, 64);
        if (keys.has(key)) {
            throw new DataAppTemplatePackageError(
                `${DATA_APP_TEMPLATE_MANIFEST_PATH}: duplicate question key "${key}"`,
            );
        }
        keys.add(key);
        const label = requireString(q.label, `questions[${index}].label`, 200);
        if (q.kind !== undefined && q.kind !== 'text' && q.kind !== 'list') {
            throw new DataAppTemplatePackageError(
                `${DATA_APP_TEMPLATE_MANIFEST_PATH}: questions[${index}].kind must be "text" or "list"`,
            );
        }
        const question: TemplateQuestion = { key, label };
        if (typeof q.placeholder === 'string')
            question.placeholder = q.placeholder;
        if (typeof q.default === 'string') question.default = q.default;
        if (typeof q.required === 'boolean') question.required = q.required;
        if (q.kind === 'list') question.kind = 'list';
        return question;
    });
};

/**
 * Parses and validates `src/template.json`. Only the parts the platform
 * needs are validated (identity + questions); the rest of the manifest is the
 * template's own business and rides along untouched inside the package.
 */
export const parseDataAppTemplateManifest = (
    contents: string,
): DataAppTemplateManifest => {
    let raw: unknown;
    try {
        raw = JSON.parse(contents);
    } catch (e) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH} is not valid JSON`,
        );
    }
    if (typeof raw !== 'object' || raw === null) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH} must be a JSON object`,
        );
    }
    const manifest = raw as Record<string, unknown>;
    if (manifest.templateVersion !== 1) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: unsupported templateVersion (expected 1)`,
        );
    }
    if (typeof manifest.template !== 'object' || manifest.template === null) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: template block is required`,
        );
    }
    const template = manifest.template as Record<string, unknown>;
    const id = requireString(template.id, 'template.id', 64);
    if (!DATA_APP_TEMPLATE_SLUG_PATTERN.test(id)) {
        throw new DataAppTemplatePackageError(
            `${DATA_APP_TEMPLATE_MANIFEST_PATH}: template.id must be a slug (lowercase letters, digits, hyphens; 2-64 characters)`,
        );
    }
    return {
        templateVersion: 1,
        template: {
            id,
            name: requireString(
                template.name,
                'template.name',
                MAX_NAME_LENGTH,
            ),
            description: requireString(
                template.description,
                'template.description',
                MAX_DESCRIPTION_LENGTH,
            ),
            category: requireString(
                template.category,
                'template.category',
                MAX_CATEGORY_LENGTH,
            ),
        },
        questions: parseQuestions(manifest.questions),
    };
};
