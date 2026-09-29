import {
    assertUnreachable,
    type GenerativeUiLeafBlock,
} from '@lightdash/common';
import {
    Checkbox,
    Input,
    Loader,
    MultiSelect,
    SegmentedControl,
    Select,
    Textarea,
    TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { type FC } from 'react';
import { NumberInput } from '../../../../../../../components/common/NumberInput';
import { resolveOptions, type GenerativeUiOption } from '../bindings';
import { type GenerativeUiStateValue } from '../fields';
import {
    queryNoticeOf,
    type GenerativeUiQueryNotice,
    type GenerativeUiRenderContext,
} from './renderContext';

export type GenerativeUiFieldBlock = Extract<
    GenerativeUiLeafBlock,
    {
        type:
            | 'textInput'
            | 'textarea'
            | 'numberInput'
            | 'checkbox'
            | 'dateInput'
            | 'select'
            | 'multiSelect'
            | 'segmented';
    }
>;

type OptionsBlock = Extract<
    GenerativeUiFieldBlock,
    { type: 'select' | 'multiSelect' }
>;

const textOf = (value: GenerativeUiStateValue | undefined): string =>
    typeof value === 'string' ? value : '';

const textsOf = (value: GenerativeUiStateValue | undefined): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

const optionsOf = (
    block: OptionsBlock,
    context: GenerativeUiRenderContext,
): { data: GenerativeUiOption[]; notice: GenerativeUiQueryNotice | null } => {
    const resolved = resolveOptions(block.options, context.loadedQueries);
    return {
        data: resolved.status === 'ready' ? resolved.options : [],
        notice: Array.isArray(block.options)
            ? null
            : queryNoticeOf(block.options.$query, context),
    };
};

/** One input bound to its state key; spec text only reaches labels and placeholders. */
export const FieldBlock: FC<{
    block: GenerativeUiFieldBlock;
    context: GenerativeUiRenderContext;
}> = ({ block, context }) => {
    const value = context.state[block.key];
    const error = context.errors[block.key];
    const disabled = context.locked;
    const setValue = (next: GenerativeUiStateValue) =>
        context.setValue(block.key, next);

    switch (block.type) {
        case 'textInput':
            return (
                <TextInput
                    size="xs"
                    label={block.label}
                    placeholder={block.placeholder}
                    withAsterisk={block.required}
                    value={textOf(value)}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    error={error}
                    disabled={disabled}
                />
            );
        case 'textarea':
            return (
                <Textarea
                    size="xs"
                    label={block.label}
                    placeholder={block.placeholder}
                    withAsterisk={block.required}
                    autosize
                    minRows={2}
                    maxRows={6}
                    value={textOf(value)}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    error={error}
                    disabled={disabled}
                />
            );
        case 'numberInput':
            return (
                <NumberInput
                    size="xs"
                    label={block.label}
                    withAsterisk={block.required}
                    min={block.min}
                    max={block.max}
                    decimalScale="unlimited"
                    value={typeof value === 'number' ? value : ''}
                    onNumberChange={(next) => setValue(next ?? null)}
                    error={error}
                    disabled={disabled}
                />
            );
        case 'checkbox':
            return (
                <Checkbox
                    size="xs"
                    label={block.label}
                    checked={value === true}
                    onChange={(event) => setValue(event.currentTarget.checked)}
                    error={error}
                    disabled={disabled}
                />
            );
        case 'dateInput':
            return (
                <DateInput
                    size="xs"
                    label={block.label}
                    withAsterisk={block.required}
                    valueFormat="YYYY-MM-DD"
                    clearable
                    value={typeof value === 'string' ? value : null}
                    onChange={setValue}
                    error={error}
                    disabled={disabled}
                />
            );
        case 'select': {
            const { data, notice } = optionsOf(block, context);
            return (
                <Select
                    size="xs"
                    label={block.label}
                    withAsterisk={block.required}
                    searchable={block.searchable}
                    clearable={!block.required}
                    data={data}
                    placeholder={notice?.message}
                    rightSection={
                        notice?.kind === 'loading' ? <Loader size="xs" /> : null
                    }
                    value={typeof value === 'string' ? value : null}
                    onChange={setValue}
                    error={
                        error ??
                        (notice?.kind === 'error' ? notice.message : null)
                    }
                    disabled={disabled || notice?.kind === 'waiting'}
                />
            );
        }
        case 'multiSelect': {
            const { data, notice } = optionsOf(block, context);
            return (
                <MultiSelect
                    size="xs"
                    label={block.label}
                    withAsterisk={block.required}
                    searchable
                    clearable
                    data={data}
                    placeholder={notice?.message}
                    rightSection={
                        notice?.kind === 'loading' ? <Loader size="xs" /> : null
                    }
                    value={textsOf(value)}
                    onChange={setValue}
                    error={
                        error ??
                        (notice?.kind === 'error' ? notice.message : null)
                    }
                    disabled={disabled || notice?.kind === 'waiting'}
                />
            );
        }
        case 'segmented':
            return (
                <Input.Wrapper size="xs" label={block.label} error={error}>
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        data={block.options}
                        value={textOf(value)}
                        onChange={setValue}
                        disabled={disabled}
                    />
                </Input.Wrapper>
            );
        default:
            return assertUnreachable(
                block,
                'Unknown generative UI field block',
            );
    }
};
