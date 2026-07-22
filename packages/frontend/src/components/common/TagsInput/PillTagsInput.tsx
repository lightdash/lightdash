import {
    CloseButton,
    Pill,
    PillsInput,
    type MantineRadius,
    type MantineSize,
} from '@mantine-8/core';
import { useUncontrolled } from '@mantine-8/hooks';
import uniq from 'lodash/uniq';
import {
    Fragment,
    type FC,
    type FocusEventHandler,
    type KeyboardEventHandler,
    type ReactNode,
} from 'react';
import { TagPill, type TagPillSize } from './TagPill';

export type PillTagsInputProps = {
    value: string[];
    onChange: (value: string[]) => void;
    /** Custom pill renderer; defaults to TagPill */
    renderPill?: (props: { value: string; onRemove: () => void }) => ReactNode;
    /** Reject an add-batch entirely when any tag fails; input text is kept */
    validate?: (tag: string) => boolean;
    splitChars?: string[];
    clearable?: boolean;
    acceptValueOnBlur?: boolean;
    allowDuplicates?: boolean;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    rightSection?: ReactNode;
    placeholder?: string;
    disabled?: boolean;
    size?: MantineSize;
    radius?: MantineRadius;
    w?: string | number;
    mb?: string | number;
    onBlur?: FocusEventHandler<HTMLInputElement>;
    'data-autofocus'?: boolean;
    classNames?: { input?: string };
};

export const PillTagsInput: FC<PillTagsInputProps> = ({
    value,
    onChange,
    renderPill,
    validate,
    splitChars = [','],
    clearable = false,
    acceptValueOnBlur = true,
    allowDuplicates = false,
    searchValue,
    onSearchChange,
    rightSection,
    placeholder,
    disabled = false,
    size = 'sm',
    radius,
    w,
    mb,
    onBlur,
    'data-autofocus': dataAutofocus,
    classNames,
}) => {
    const [search, setSearch] = useUncontrolled({
        value: searchValue,
        defaultValue: '',
        finalValue: '',
        onChange: onSearchChange,
    });

    const pillSize: TagPillSize = size === 'xs' ? 'xs' : 'sm';

    const handleAddTags = (raw: string) => {
        const escaped = splitChars
            .map((char) => char.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
            .join('');
        let tags = raw
            .split(new RegExp(`[${escaped}]`))
            .map((tag) => tag.trim())
            .filter(Boolean);

        if (tags.length === 0) {
            setSearch('');
            return;
        }

        if (!allowDuplicates) {
            tags = uniq(tags).filter((tag) => !value.includes(tag));
        }

        if (validate && tags.some((tag) => !validate(tag))) {
            return;
        }

        if (tags.length > 0) {
            onChange([...value, ...tags]);
        }
        setSearch('');
    };

    const handleSearchChange = (next: string) => {
        if (splitChars.some((char) => next.includes(char))) {
            handleAddTags(next);
            return;
        }
        setSearch(next);
    };

    const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (search.trim() !== '') {
                handleAddTags(search);
            }
        } else if (
            event.key === 'Backspace' &&
            search === '' &&
            value.length > 0
        ) {
            onChange(value.slice(0, -1));
        }
    };

    const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
        if (acceptValueOnBlur && search.trim() !== '') {
            handleAddTags(search);
        }
        onBlur?.(event);
    };

    const handleRemove = (tag: string) => {
        onChange(value.filter((current) => current !== tag));
    };

    const showClearButton = clearable && !disabled && value.length > 0;

    return (
        <PillsInput
            size={size}
            radius={radius}
            disabled={disabled}
            w={w}
            mb={mb}
            classNames={classNames}
            rightSection={
                showClearButton ? (
                    <CloseButton
                        aria-label="Clear all"
                        size="sm"
                        variant="transparent"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            onChange([]);
                            setSearch('');
                        }}
                    />
                ) : (
                    rightSection
                )
            }
        >
            <Pill.Group size={size}>
                {value.map((tag) =>
                    renderPill ? (
                        <Fragment key={tag}>
                            {renderPill({
                                value: tag,
                                onRemove: () => handleRemove(tag),
                            })}
                        </Fragment>
                    ) : (
                        <TagPill
                            key={tag}
                            label={tag}
                            size={pillSize}
                            disabled={disabled}
                            onRemove={() => handleRemove(tag)}
                        />
                    ),
                )}

                <PillsInput.Field
                    value={search}
                    placeholder={placeholder}
                    disabled={disabled}
                    data-autofocus={dataAutofocus}
                    onChange={(event) =>
                        handleSearchChange(event.currentTarget.value)
                    }
                    onKeyDown={handleKeyDown}
                    onBlur={handleBlur}
                />
            </Pill.Group>
        </PillsInput>
    );
};
