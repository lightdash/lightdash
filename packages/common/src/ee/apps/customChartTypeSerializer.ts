import assertUnreachable from '../../utils/assertUnreachable';
import { type DataAppVizConfigOption } from './dataAppVizConfigOptions';
import { type DataAppVizSchema } from './types';

/**
 * A custom chart type as the AI agent sees it: a project-level library entry
 * identified by slug (never uuid), backed by a data app viz schema.
 */
export type CustomChartType = {
    slug: string;
    name: string;
    description: string;
    schema: DataAppVizSchema;
};

/**
 * The slice of the library the agent sees inline: newest first, capped at the
 * system-prompt inline limit; totalCount is the whole library's size.
 */
export type CustomChartTypeLibrary = {
    types: CustomChartType[];
    totalCount: number;
};

const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const optionPromptLabel = (option: DataAppVizConfigOption): string =>
    option.group ? `${option.group}: ${option.label}` : option.label;

/**
 * Compact per-type surface for the agent system prompt: name, description,
 * field labels, config options as `group: label`. Full detail (slot names,
 * types, defaults) is fetched on demand via the findCustomChartTypes tool.
 */
export const serializeCustomChartTypeForPrompt = (
    type: CustomChartType,
): string => {
    const lines = [
        `<customChartType slug="${escapeXml(type.slug)}" name="${escapeXml(
            type.name,
        )}">`,
    ];
    if (type.description) {
        lines.push(`<description>${escapeXml(type.description)}</description>`);
    }
    lines.push(
        `<fields>${escapeXml(
            type.schema.fields.map((field) => field.label).join('; '),
        )}</fields>`,
    );
    if (type.schema.configOptions.length > 0) {
        lines.push(
            `<configOptions>${escapeXml(
                type.schema.configOptions.map(optionPromptLabel).join('; '),
            )}</configOptions>`,
        );
    }
    const fieldOptionLabels = type.schema.fields.flatMap((field) =>
        (field.configOptions ?? []).map(
            (option) => `${field.label}: ${optionPromptLabel(option)}`,
        ),
    );
    if (fieldOptionLabels.length > 0) {
        lines.push(
            `<fieldConfigOptions>${escapeXml(fieldOptionLabels.join('; '))}</fieldConfigOptions>`,
        );
    }
    const gradientLabels = type.schema.fields
        .filter((field) => field.colorOptions?.gradient)
        .map((field) => `${field.label}: numeric gradient`);
    if (gradientLabels.length > 0) {
        lines.push(
            `<fieldColors>${escapeXml(gradientLabels.join('; '))}</fieldColors>`,
        );
    }
    lines.push('</customChartType>');
    return lines.join('\n');
};

const serializeOptionDetail = (option: DataAppVizConfigOption): string => {
    const parts: string[] = [];
    if (option.group) {
        parts.push(`group: ${option.group}`);
    }
    switch (option.type) {
        case 'boolean':
            parts.push(`default: ${option.default}`);
            break;
        case 'select':
            parts.push(
                `choices: ${option.choices
                    .map((choice) => choice.value)
                    .join(' | ')}`,
                `default: ${option.default}`,
            );
            break;
        case 'number':
            if (option.min !== undefined) parts.push(`min: ${option.min}`);
            if (option.max !== undefined) parts.push(`max: ${option.max}`);
            parts.push(`default: ${option.default}`);
            break;
        case 'text':
        case 'color':
            parts.push(`default: ${JSON.stringify(option.default)}`);
            break;
        default:
            return assertUnreachable(option, 'Unknown config option type');
    }
    return `- ${option.name} "${option.label}" [${option.type}] ${parts.join(
        ', ',
    )}`;
};

/**
 * Full schema detail returned by the findCustomChartTypes tool: everything
 * needed to author a field mapping and option values for this type.
 */
export const serializeCustomChartTypeSchema = (
    type: CustomChartType,
): string => {
    const lines = [`name: ${type.name}`, `slug: ${type.slug}`];
    if (type.description) {
        lines.push(`description: ${JSON.stringify(type.description)}`);
    }
    if (type.schema.inputGuidance) {
        lines.push(
            `inputGuidance: ${JSON.stringify(type.schema.inputGuidance)}`,
        );
    }
    lines.push('fields:');
    for (const field of type.schema.fields) {
        const details = [
            field.description
                ? `description: ${JSON.stringify(field.description)}`
                : null,
            field.examples?.length
                ? `examples: ${field.examples
                      .map((example) => JSON.stringify(example))
                      .join(' | ')}`
                : null,
        ]
            .filter((detail): detail is string => detail !== null)
            .join(', ');
        lines.push(
            `- ${field.name} "${field.label}" (${field.type}, ${
                field.required ? 'required' : 'optional'
            }${field.multiple ? ', multiple' : ''})${
                details ? ` — ${details}` : ''
            }`,
        );
        if (field.configOptions?.length) {
            lines.push(
                `fieldConfigOptions for ${field.name} (per bound field id):`,
            );
            field.configOptions.forEach((option) =>
                lines.push(serializeOptionDetail(option)),
            );
        }
        const gradient = field.colorOptions?.gradient;
        if (gradient) {
            lines.push(
                `fieldColorGradient for ${field.name} (per bound field id): enabled: ${gradient.enabled}, start: ${JSON.stringify(gradient.start)}, end: ${JSON.stringify(gradient.end)}, min: ${gradient.min}, max: ${gradient.max}`,
            );
        }
    }
    if (type.schema.configOptions.length === 0) {
        lines.push('configOptions: none');
    } else {
        lines.push('configOptions:');
        for (const option of type.schema.configOptions) {
            lines.push(serializeOptionDetail(option));
        }
    }
    return lines.join('\n');
};
