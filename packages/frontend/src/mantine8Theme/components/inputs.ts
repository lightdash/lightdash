import {
    Autocomplete,
    ColorInput,
    ColorPicker,
    Combobox,
    Fieldset,
    FileInput,
    Input,
    JsonInput,
    MultiSelect,
    NativeSelect,
    NumberInput,
    PasswordInput,
    Pill,
    PillsInput,
    PinInput,
    Rating,
    Select,
    TagsInput,
    Textarea,
    TextInput,
    rem,
    type MantineTheme,
} from '@mantine-8/core';
import classes from './inputs.module.css';

const subtleInputStyles = (theme: MantineTheme) => ({
    input: {
        fontWeight: 500,
        fontSize: 14,
        '--input-bd': theme.colors.ldGray[2],
        borderRadius: theme.radius.md,
        boxShadow: theme.shadows.subtle,
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        color: theme.colors.ldGray[7],
    },
    label: {
        fontWeight: 500,
        color: theme.colors.ldGray[7],
        marginBottom: theme.spacing.xxs,
    },
    pill: {
        background: theme.colors.ldGray[1],
        color: theme.colors.ldGray[9],
    },
});

const fieldStyles = {
    label: {
        fontSize: rem(13),
        fontWeight: 500,
        letterSpacing: '-0.006em',
        marginBottom: rem(6),
    },
    description: { fontSize: rem(12) },
};

const fieldClassNames = { input: classes.input };
const dropdownClassNames = {
    dropdown: classes.dropdown,
    option: classes.option,
};
const composerClassNames = (
    _theme: MantineTheme,
    props: { variant?: string },
) => ({
    input:
        props.variant === 'composer'
            ? `${classes.input} ${classes.composer}`
            : classes.input,
});

const inputExtension = {
    defaultProps: { radius: 'md' as const },
    classNames: fieldClassNames,
    styles: fieldStyles,
};

export const inputsComponents = {
    Input: Input.extend({
        defaultProps: { radius: 'md' },
        classNames: fieldClassNames,
    }),
    TextInput: TextInput.extend({
        ...inputExtension,
        classNames: composerClassNames,
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    Textarea: Textarea.extend({
        ...inputExtension,
        classNames: composerClassNames,
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    Select: Select.extend({
        ...inputExtension,
        classNames: { ...fieldClassNames, ...dropdownClassNames },
        defaultProps: {
            checkIconPosition: 'right',
            radius: 'md',
        },
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    NumberInput: NumberInput.extend(inputExtension),
    PasswordInput: PasswordInput.extend({
        ...inputExtension,
        styles: (theme, props) => ({
            ...fieldStyles,
            ...(props.variant === 'subtle' ? subtleInputStyles(theme) : {}),
        }),
    }),
    Autocomplete: Autocomplete.extend({
        ...inputExtension,
        classNames: { ...fieldClassNames, ...dropdownClassNames },
    }),
    MultiSelect: MultiSelect.extend({
        ...inputExtension,
        classNames: { ...fieldClassNames, ...dropdownClassNames },
        defaultProps: {
            checkIconPosition: 'right',
            radius: 'md',
        },
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    TagsInput: TagsInput.extend({
        ...inputExtension,
        classNames: { ...fieldClassNames, ...dropdownClassNames },
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    PillsInput: PillsInput.extend({
        ...inputExtension,
        vars: (theme, props) =>
            props.variant === 'subtle' ? subtleInputStyles(theme) : {},
    }),
    PinInput: PinInput.extend({
        defaultProps: { radius: 'md' },
        classNames: fieldClassNames,
    }),
    JsonInput: JsonInput.extend({
        ...inputExtension,
        defaultProps: { autosize: true, minRows: 4, radius: 'md' },
        styles: {
            ...fieldStyles,
            input: {
                fontFamily: 'var(--mantine-font-family-monospace)',
                fontSize: rem(13),
            },
        },
    }),
    NativeSelect: NativeSelect.extend(inputExtension),
    FileInput: FileInput.extend(inputExtension),
    ColorInput: ColorInput.extend(inputExtension),
    ColorPicker: ColorPicker.extend({
        defaultProps: { format: 'hex' },
    }),
    Rating: Rating.extend({}),
    Fieldset: Fieldset.extend({
        classNames: {
            legend: classes.fieldsetLegend,
            root: classes.fieldset,
        },
        defaultProps: { radius: 'md', variant: 'default' },
    }),
    Pill: Pill.extend({
        classNames: { root: classes.pill },
    }),
    Combobox: Combobox.extend({
        classNames: dropdownClassNames,
    }),
};
