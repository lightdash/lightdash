import { extractSystemStyles, Input } from '@mantine/core';
import {
    BaseSelectProps,
    BaseSelectStylesNames,
} from '@mantine/core/lib/Select/types';
import { useId, useMergedRef, useUncontrolled } from '@mantine/hooks';
import {
    DefaultProps,
    MantineSize,
    Selectors,
    useComponentDefaultProps,
} from '@mantine/styles';
import uniq from 'lodash/uniq';
import React, { forwardRef, useRef, useState } from 'react';
import {
    DefaultValue,
    DefaultValueStylesNames,
} from './DefaultValue/DefaultValue';
import useStyles, { InputFieldPosition } from './TagInput.styles';
import { getTagInputRightSectionProps } from './TagInputRightSection/get-taginput-right-section-props';

export type TagInputStylesNames =
    | DefaultValueStylesNames
    | Exclude<Selectors<typeof useStyles>, 'tagInputEmpty'>
    | Exclude<
          BaseSelectStylesNames,
          | 'selected'
          | 'item'
          | 'nothingFound'
          | 'separator'
          | 'separatorLabel'
          | 'itemsWrapper'
          | 'dropdown'
      >;
export interface TagInputProps
    extends DefaultProps<TagInputStylesNames>,
        Omit<BaseSelectProps, 'style'> {
    /** Input size */
    size?: MantineSize;

    /** Properties spread to root element */
    wrapperProps?: Record<string, any>;

    /** Controlled input value */
    value?: string[];

    /** Uncontrolled input defaultValue */
    defaultValue?: string[];

    /** Controlled input onChange handler */
    onChange?(value: string[]): void;

    /** Component used to render values */
    valueComponent?: React.FC<any>;

    /** Allow to clear item */
    clearable?: boolean;

    /** Clear input field value on blur */
    clearInputOnBlur?: boolean;

    /** Called each time search query changes */
    onChangeInput?(query: string): void;

    /** Get input ref */
    elementRef?: React.ForwardedRef<HTMLInputElement>;

    /** Limit amount of tags */
    maxTags?: number;

    /** Component used to render right section */
    rightSection?: React.ReactNode;

    /** Called to split after onPaste  */
    pasteSplit?: (data: any) => string[];

    splitChars?: string[];

    /** Used for validation when adding tags */
    validationRegex?: RegExp;

    /** Called for validation when adding tags */
    validationFunction?: (data: string) => boolean;

    /** Called when validationRegex reject tags */
    onValidationReject?: (data: string[]) => void;

    /** Allow to only unique */
    allowDuplicates?: boolean;

    /** Input Tag position */
    inputFieldPosition?: InputFieldPosition;

    /** Props added to clear button */
    clearButtonProps?: React.ComponentPropsWithoutRef<'button'>;

    /** Controlled search value */
    searchValue?: string;

    /** Uncontrolled search defaultValue */
    defaultSearchValue?: string;

    /** Called when search changes */
    onSearchChange?: (value: string) => void;

    /** Add on blur */
    addOnBlur?: boolean;
}

function splitTags(splitChars: string[] | undefined, value: string) {
    if (!splitChars) return [value];

    return value
        .split(new RegExp(`[${splitChars.join('')}]`))
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '');
}

interface GetSplittedTagsInput {
    splitChars: string[] | undefined;
    allowDuplicates: boolean | undefined;
    maxTags: number | undefined;
    value: string;
    currentTags: string[];
}

function getSplittedTags({
    splitChars,
    allowDuplicates,
    maxTags,
    value,
    currentTags,
}: GetSplittedTagsInput) {
    const splitted = splitTags(splitChars, value);
    const merged = allowDuplicates
        ? [...currentTags, ...splitted]
        : [...new Set([...currentTags, ...splitted])];

    return maxTags ? merged.slice(0, maxTags) : merged;
}

const getClipboardData = (e: React.ClipboardEvent): string => {
    if (e.clipboardData) {
        return e.clipboardData.getData('text/plain');
    }

    return '';
};

const defaultProps: Partial<TagInputProps> = {
    size: 'sm',
    valueComponent: DefaultValue,
    disabled: false,
    allowDuplicates: false,
    splitChars: [','],
    validationRegex: /.*/,
    onValidationReject: () => {},
    inputFieldPosition: 'inside',
};

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(
    (props, ref) => {
        const {
            className,
            style,
            required,
            label,
            description,
            size,
            error,
            classNames,
            styles,
            wrapperProps,
            value,
            defaultValue,
            onChange,
            valueComponent: Value,
            id,
            onFocus,
            onBlur,
            placeholder,
            clearable,
            variant,
            disabled,
            radius,
            icon,
            rightSection,
            rightSectionWidth,
            sx,
            name,
            errorProps,
            labelProps,
            descriptionProps,
            form,
            onKeyDown,
            unstyled,
            inputContainer,
            inputWrapperOrder,
            readOnly,
            withAsterisk,
            clearInputOnBlur = false,
            onChangeInput,
            maxTags,
            splitChars,
            validationRegex,
            validationFunction,
            searchValue,
            defaultSearchValue,
            onValidationReject,
            onSearchChange,
            allowDuplicates,
            inputFieldPosition,
            clearButtonProps,
            addOnBlur = true,
            ...others
        } = useComponentDefaultProps('TagInput', defaultProps, props);

        const { classes, cx, theme } = useStyles(
            { invalid: !!error },
            { name: 'TagInput', classNames, styles, size, variant, unstyled },
        );
        const { systemStyles, rest } = extractSystemStyles(others);

        const inputRef = useRef<HTMLInputElement>();
        const wrapperRef = useRef<HTMLDivElement>();
        const uuid = useId(id);
        const [IMEOpen, setIMEOpen] = useState(false);

        const [_value, setValue] = useUncontrolled({
            value,
            defaultValue,
            finalValue: [],
            onChange,
        });

        const [_searchValue, setSearchValue] = useUncontrolled({
            value: searchValue,
            defaultValue: defaultSearchValue,
            finalValue: '',
            onChange: onSearchChange,
        });

        const valuesOverflow = useRef(!!maxTags && maxTags < _value.length);

        const handleValueRemove = (_index: number) => {
            if (!readOnly) {
                const newValue = _value.filter((_, index) => index !== _index);
                setValue(newValue);

                if (!!maxTags && newValue.length < maxTags) {
                    valuesOverflow.current = false;
                }
            }
        };

        const handleInputChange = (
            event: React.ChangeEvent<HTMLInputElement>,
        ) => {
            if (typeof onChangeInput === 'function') {
                onChangeInput(event.currentTarget.value);
            }

            setSearchValue(event.currentTarget.value);
        };

        const handleInputFocus = (
            event: React.FocusEvent<HTMLInputElement>,
        ) => {
            if (typeof onFocus === 'function') {
                onFocus(event);
            }
        };

        const handleAddTags = (newTags: string[]): boolean => {
            let tags = newTags;
            if (readOnly) {
                return false;
            }
            if (!allowDuplicates) {
                tags = uniq(tags);
                tags = tags.filter((tag) =>
                    _value.every((currentTag) => currentTag !== tag),
                );
            }

            const rejectedTags = tags.filter((tag) => {
                if (validationFunction) {
                    return (
                        !validationRegex!.test(tag) ||
                        (validationFunction ? !validationFunction(tag) : true)
                    );
                }

                return !validationRegex!.test(tag);
            });

            if (maxTags && maxTags >= 0) {
                const remainingLimit = Math.max(maxTags - _value.length, 0);
                tags = tags.slice(0, remainingLimit);
            }

            if (onValidationReject && rejectedTags.length > 0) {
                onValidationReject(rejectedTags);
            }

            if (rejectedTags.length > 0) {
                return false;
            }

            if (tags.length > 0) {
                const newValue = _value.concat(tags);
                setValue(newValue);
                setSearchValue('');
                return true;
            }

            setSearchValue('');
            return false;
        };

        const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
            if (addOnBlur && _searchValue !== '') {
                handleAddTags([_searchValue]);
                setSearchValue('');
            }

            if (typeof onBlur === 'function') {
                onBlur(event);
            }

            if (clearInputOnBlur) {
                setSearchValue('');
            }
        };

        const handleInputKeydown = (
            event: React.KeyboardEvent<HTMLInputElement>,
        ) => {
            if (IMEOpen) {
                return;
            }

            if (readOnly) {
                return;
            }

            const length = _searchValue.trim().length;

            if (splitChars!.includes(event.key) && length > 0) {
                const tags = getSplittedTags({
                    splitChars,
                    allowDuplicates,
                    maxTags,
                    value: _searchValue,
                    currentTags: _value,
                });

                handleAddTags(tags);
                setSearchValue('');
                event.preventDefault();

                return;
            }

            switch (event.key) {
                case 'Enter': {
                    if (_searchValue) {
                        event.preventDefault();

                        handleAddTags([_searchValue]);
                        if (maxTags && _value.length === maxTags - 1) {
                            valuesOverflow.current = true;
                            inputRef.current?.blur();
                            return;
                        }
                        inputRef.current?.focus();
                    }

                    break;
                }

                case 'Backspace': {
                    if (_value.length > 0 && _searchValue.length === 0) {
                        setValue(_value.slice(0, -1));
                    }

                    break;
                }
            }
        };

        const selectedItems = _value
            .map((val) => {
                const selectedItem = {
                    value: val,
                    label: val,
                };
                return selectedItem;
            })
            .filter((val) => !!val)
            .map((item, index) => {
                const Component = Value!;

                return (
                    <Component
                        {...item}
                        variant={variant}
                        disabled={disabled}
                        className={classes.value}
                        onRemove={() => {
                            handleValueRemove(index);
                        }}
                        key={`${item.value}-${index}`}
                        size={size}
                        styles={styles}
                        classNames={classNames}
                        radius={radius}
                        readOnly={readOnly}
                    />
                );
            });

        const handleClear = (): void => {
            setSearchValue('');
            setValue([]);
            inputRef.current?.focus();
            valuesOverflow.current = false;
        };

        const handlePaste = (e: React.ClipboardEvent): void => {
            e.preventDefault();
            const data = getClipboardData(e);
            const tags = splitTags(splitChars, data);
            handleAddTags(tags);
        };

        const inputElement = (
            <input
                // @ts-ignore
                ref={useMergedRef(ref, inputRef)}
                // @ts-ignore
                type="text"
                id={uuid}
                className={cx(classes.tagInput, {
                    [classes.tagInputEmpty]: _value.length === 0,
                })}
                onKeyDown={handleInputKeydown}
                value={_searchValue}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                // @ts-ignore
                onCompositionStart={() => setIMEOpen(true)}
                // @ts-ignore
                onCompositionEnd={() => setIMEOpen(false)}
                onBlur={handleInputBlur}
                readOnly={valuesOverflow.current || readOnly}
                placeholder={_value.length === 0 ? placeholder : undefined}
                disabled={disabled}
                // @ts-ignore
                autoComplete="off"
                data-1p-ignore
                {...rest}
            />
        );

        return (
            <Input.Wrapper
                required={required}
                id={uuid}
                label={label}
                error={error}
                description={description}
                size={size}
                className={className}
                style={style}
                classNames={classNames}
                styles={styles}
                __staticSelector="TagInput"
                sx={sx}
                errorProps={errorProps}
                descriptionProps={descriptionProps}
                labelProps={labelProps}
                inputContainer={inputContainer}
                inputWrapperOrder={inputWrapperOrder}
                unstyled={unstyled}
                withAsterisk={withAsterisk}
                variant={variant}
                {...systemStyles}
                {...wrapperProps}
            >
                <div
                    className={classes.wrapper}
                    aria-haspopup="listbox"
                    aria-owns={`${uuid}-items`}
                    aria-controls={uuid}
                    tabIndex={-1}
                    // @ts-ignore
                    ref={wrapperRef}
                >
                    {inputFieldPosition === 'top' && (
                        <div className={classes.values} id={`${uuid}-items`}>
                            {selectedItems}
                        </div>
                    )}
                    <Input<'div'>
                        __staticSelector="TagInput"
                        style={{ overflow: 'hidden' }}
                        component="div"
                        multiline
                        size={size}
                        variant={variant}
                        disabled={disabled}
                        error={error}
                        required={required}
                        radius={radius}
                        icon={icon}
                        unstyled={unstyled}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            if (!disabled && !valuesOverflow.current) {
                                inputRef.current?.focus();
                            }
                        }}
                        classNames={{
                            ...classNames,
                            input: cx(
                                classes.tagInputContainer,
                                classNames?.input,
                            ),
                        }}
                        onPaste={handlePaste}
                        {...getTagInputRightSectionProps({
                            theme,
                            rightSection,
                            rightSectionWidth,
                            // @ts-ignore
                            styles,
                            // @ts-ignore
                            size,
                            // @ts-ignore
                            shouldClear: clearable && _value.length > 0,
                            onClear: handleClear,
                            error,
                            disabled,
                            clearButtonProps,
                            // @ts-ignore
                            readOnly,
                        })}
                    >
                        {inputFieldPosition === 'inside' && (
                            <div
                                className={classes.values}
                                id={`${uuid}-items`}
                            >
                                {selectedItems}
                                {inputElement}
                            </div>
                        )}
                        {(inputFieldPosition === 'bottom' ||
                            inputFieldPosition === 'top') && (
                            <>{inputElement}</>
                        )}
                    </Input>
                    {inputFieldPosition === 'bottom' && (
                        <div className={classes.values} id={`${uuid}-items`}>
                            {selectedItems}
                        </div>
                    )}
                </div>

                <input
                    type="hidden"
                    name={name}
                    value={_value.join(',')}
                    form={form}
                    disabled={disabled}
                />
            </Input.Wrapper>
        );
    },
);

TagInput.displayName = '@mantine/core/TagInput';
