import {
    assertUnreachable,
    chartAsCodeSchema,
    dashboardAsCodeSchema,
    ParameterError,
} from '@lightdash/common';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { compact, get, set, uniq } from 'lodash';

type ContentType = 'dashboard' | 'chart';

type PatchOperation = {
    path?: unknown;
    from?: unknown;
};

const BANNED_PATHS: Record<
    ContentType,
    Array<{
        path: string;
        reason: string;
    }>
> = {
    chart: [
        { path: '/slug', reason: 'slug is read-only' },
        { path: '/updatedAt', reason: 'updatedAt is read-only' },
        { path: '/downloadedAt', reason: 'downloadedAt is read-only' },
        {
            path: '/verified',
            reason: 'verified cannot be edited with editContent',
        },
        { path: '/verification', reason: 'verification is read-only' },
    ],
    dashboard: [
        { path: '/slug', reason: 'slug is read-only' },
        { path: '/updatedAt', reason: 'updatedAt is read-only' },
        { path: '/downloadedAt', reason: 'downloadedAt is read-only' },
        {
            path: '/verified',
            reason: 'verified cannot be edited with editContent',
        },
        { path: '/verification', reason: 'verification is read-only' },
    ],
};

const TIMESTAMP_FIELDS: Record<ContentType, string[]> = {
    chart: ['/updatedAt', '/downloadedAt', '/verification/verifiedAt'],
    dashboard: ['/updatedAt', '/downloadedAt', '/verification/verifiedAt'],
};

const CHART_CONFIG_SUPPORTED_TYPES = [
    'big_number',
    'cartesian',
    'custom',
    'pie',
    'funnel',
    'table',
    'treemap',
    'gauge',
    'map',
    'sankey',
] as const;

export class AiAgentContentValidation {
    private readonly ajv: Ajv;

    private readonly bannedPaths = BANNED_PATHS;

    private readonly timestampFields = TIMESTAMP_FIELDS;

    private validators:
        | {
              chart: ValidateFunction;
              dashboard: ValidateFunction;
          }
        | undefined;

    constructor() {
        this.ajv = new Ajv({
            coerceTypes: true,
            allErrors: true,
            allowUnionTypes: true,
            discriminator: true,
        });
        addFormats(this.ajv);
    }

    validatePatch(type: ContentType, patch: unknown[]): void {
        const errors = patch.flatMap((operation, index) => {
            const op = operation as PatchOperation;
            return compact([
                typeof op.path === 'string'
                    ? AiAgentContentValidation.formatBannedPathError(
                          index,
                          'path',
                          this.getBannedPathError(type, op.path),
                      )
                    : undefined,
                typeof op.from === 'string'
                    ? AiAgentContentValidation.formatBannedPathError(
                          index,
                          'from',
                          this.getBannedPathError(type, op.from),
                      )
                    : undefined,
            ]);
        });

        if (errors.length > 0) {
            throw new ParameterError(
                `Patch contains disallowed paths:\n${errors
                    .map((error) => `- ${error}`)
                    .join('\n')}`,
                { validationErrors: errors },
            );
        }
    }

    validateContent(type: ContentType, content: unknown): void {
        const validator = this.getValidator(type);
        const normalizedContent = this.normalizeTimestampFields(type, content);
        const valid = validator(normalizedContent);

        if (valid) {
            return;
        }

        const validationErrors = AiAgentContentValidation.formatErrors(
            validator.errors ?? [],
        );

        throw new ParameterError(
            `Edited ${type} is invalid:\n${validationErrors
                .map((error) => `- ${error}`)
                .join('\n')}`,
            { validationErrors },
        );
    }

    private getValidator(type: ContentType): ValidateFunction {
        const validators = this.getValidators();
        switch (type) {
            case 'chart':
                return validators.chart;
            case 'dashboard':
                return validators.dashboard;
            default:
                return assertUnreachable(type, 'Unsupported content type');
        }
    }

    private getValidators(): {
        chart: ValidateFunction;
        dashboard: ValidateFunction;
    } {
        if (this.validators) {
            return this.validators;
        }

        this.validators = {
            chart: this.ajv.compile(chartAsCodeSchema),
            dashboard: this.ajv.compile(dashboardAsCodeSchema),
        };

        return this.validators;
    }

    private getBannedPathError(
        type: ContentType,
        path: string,
    ): string | undefined {
        const banned = this.bannedPaths[type].find(
            (entry) => path === entry.path || path.startsWith(`${entry.path}/`),
        );

        if (!banned) {
            return undefined;
        }

        return `Patch path "${path}" is not allowed: ${banned.reason}`;
    }

    private static formatBannedPathError(
        index: number,
        source: 'path' | 'from',
        error: string | undefined,
    ): string | undefined {
        return error ? `patch[${index}].${source}: ${error}` : undefined;
    }

    private normalizeTimestampFields(
        type: ContentType,
        content: unknown,
    ): unknown {
        const cloned = structuredClone(content);
        if (typeof cloned !== 'object' || cloned === null) {
            return cloned;
        }

        for (const path of this.timestampFields[type]) {
            const pathSegments = path.split('/').filter(Boolean);
            const value = get(cloned, pathSegments);

            if (value instanceof Date) {
                set(cloned, pathSegments, value.toISOString());
            }
        }

        return cloned;
    }

    private static formatErrors(errors: ErrorObject[]): string[] {
        const specificErrors = errors.filter(
            (error) =>
                !['oneOf', 'anyOf', 'allOf', 'if'].includes(error.keyword),
        );
        const selectedErrors =
            specificErrors.length > 0 ? specificErrors : errors;

        const formatted = selectedErrors.map((error) =>
            AiAgentContentValidation.formatError(error),
        );

        return uniq(formatted);
    }

    private static formatError(error: ErrorObject): string {
        const path = error.instancePath || '/';

        switch (error.keyword) {
            case 'required': {
                const property = String(
                    (
                        error.params as {
                            missingProperty?: string;
                        }
                    ).missingProperty ?? 'unknown',
                );
                return `${path} is missing required property "${property}"`;
            }
            case 'additionalProperties': {
                const property = String(
                    (
                        error.params as {
                            additionalProperty?: string;
                        }
                    ).additionalProperty ?? 'unknown',
                );
                return `${path} has unexpected property "${property}"`;
            }
            case 'type': {
                const expectedType = String(
                    (error.params as { type?: string }).type ??
                        'the expected type',
                );
                return `${path} must be ${expectedType}`;
            }
            case 'enum': {
                const { allowedValues } = error.params as {
                    allowedValues?: unknown[];
                };
                if (Array.isArray(allowedValues) && allowedValues.length > 0) {
                    return `${path} must be one of: ${allowedValues
                        .map((value) => JSON.stringify(value))
                        .join(', ')}`;
                }
                return `${path} has an invalid value`;
            }
            case 'discriminator': {
                const { tag, tagValue } = error.params as {
                    tag?: string;
                    tagValue?: unknown;
                };

                if (typeof tag === 'string') {
                    const tagPath = path === '/' ? `/${tag}` : `${path}/${tag}`;
                    if (tagPath === '/chartConfig/type') {
                        return `${tagPath} must be one of: ${CHART_CONFIG_SUPPORTED_TYPES.map(
                            (value) => JSON.stringify(value),
                        ).join(', ')}; got ${JSON.stringify(tagValue)}`;
                    }
                    return `${tagPath} must be a supported value, got ${JSON.stringify(
                        tagValue,
                    )}`;
                }

                return `${path} has an invalid discriminator value`;
            }
            case 'const':
                return `${path} must match the required value`;
            default:
                return `${path} ${error.message ?? 'is invalid'}`;
        }
    }
}
