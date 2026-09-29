import {
    assertUnreachable,
    parseGenerativeUiRef,
    type GenerativeUiBlock,
    type GenerativeUiLeafBlock,
    type GenerativeUiSpec,
    type GenerativeUiState,
} from '@lightdash/common';
import { isPresent, type GenerativeUiOption } from './bindings';

export type GenerativeUiStateValue = GenerativeUiState[string];

type VisibleWhen = GenerativeUiLeafBlock['visibleWhen'];

/** Something the user fills in: an input, or the row selection of a table. */
export type GenerativeUiField = {
    kind: 'input' | 'selection';
    key: string;
    label: string;
    required: boolean;
    initial: GenerativeUiStateValue;
    visibleWhen: VisibleWhen;
    staticOptions: GenerativeUiOption[] | null;
};

export const fieldsOf = (blocks: GenerativeUiBlock[]): GenerativeUiField[] =>
    blocks.flatMap((block): GenerativeUiField[] => {
        switch (block.type) {
            case 'stack':
            case 'group':
                return fieldsOf(block.children);
            case 'heading':
            case 'text':
            case 'callout':
            case 'divider':
                return [];
            case 'textInput':
            case 'textarea':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: block.required ?? false,
                        initial: block.initial ?? '',
                        visibleWhen: block.visibleWhen,
                        staticOptions: null,
                    },
                ];
            case 'numberInput':
            case 'dateInput':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: block.required ?? false,
                        initial: block.initial ?? null,
                        visibleWhen: block.visibleWhen,
                        staticOptions: null,
                    },
                ];
            case 'checkbox':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: false,
                        initial: block.initial ?? false,
                        visibleWhen: block.visibleWhen,
                        staticOptions: null,
                    },
                ];
            case 'select':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: block.required ?? false,
                        initial: block.initial ?? null,
                        visibleWhen: block.visibleWhen,
                        staticOptions: Array.isArray(block.options)
                            ? block.options
                            : null,
                    },
                ];
            case 'multiSelect':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: block.required ?? false,
                        initial: block.initial ?? [],
                        visibleWhen: block.visibleWhen,
                        staticOptions: Array.isArray(block.options)
                            ? block.options
                            : null,
                    },
                ];
            case 'segmented':
                return [
                    {
                        kind: 'input',
                        key: block.key,
                        label: block.label,
                        required: false,
                        initial: block.initial,
                        visibleWhen: block.visibleWhen,
                        staticOptions: block.options,
                    },
                ];
            case 'table':
                if (block.selectable === undefined) return [];
                return [
                    {
                        kind: 'selection',
                        key: block.selectable.key,
                        label: block.columns[0].label,
                        required: false,
                        initial: block.selectable.multiple ? [] : null,
                        visibleWhen: block.visibleWhen,
                        staticOptions: null,
                    },
                ];
            default:
                return assertUnreachable(
                    block,
                    'Unknown generative UI block type',
                );
        }
    });

export const initialStateOf = (
    fields: GenerativeUiField[],
): GenerativeUiState =>
    Object.fromEntries(fields.map((field) => [field.key, field.initial]));

export const isVisible = (
    visibleWhen: VisibleWhen,
    state: GenerativeUiState,
): boolean =>
    visibleWhen === undefined ||
    state[visibleWhen.$state] === visibleWhen.equals;

/** State keys a forEach step iterates; running over nothing is never intended. */
export const forEachStateKeysOf = (spec: GenerativeUiSpec): Set<string> =>
    new Set(
        spec.action.steps.flatMap((step) => {
            const target =
                step.forEach === undefined
                    ? null
                    : parseGenerativeUiRef(step.forEach);
            return target?.kind === 'state' ? [target.key] : [];
        }),
    );

/** Errors for visible fields that must be filled before the action runs. */
export const validateFields = (
    fields: GenerativeUiField[],
    state: GenerativeUiState,
    forEachStateKeys: ReadonlySet<string>,
): Record<string, string> =>
    Object.fromEntries(
        fields.flatMap((field) => {
            if (!isVisible(field.visibleWhen, state)) return [];
            if (isPresent(state[field.key])) return [];
            if (field.required) return [[field.key, 'Required']];
            if (forEachStateKeys.has(field.key)) {
                return [[field.key, 'Select at least one']];
            }
            return [];
        }),
    );

/** A submitted value as the resolved card shows it. */
export const formatFieldValue = (
    field: GenerativeUiField,
    value: GenerativeUiStateValue | undefined,
): string => {
    if (value === undefined || value === null || !isPresent(value)) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (field.kind === 'selection' && Array.isArray(value)) {
        return `${value.length} selected`;
    }
    const labelOf = (item: string | number) =>
        field.staticOptions?.find((option) => option.value === String(item))
            ?.label ?? String(item);
    return Array.isArray(value)
        ? value.map(labelOf).join(', ')
        : labelOf(value);
};
