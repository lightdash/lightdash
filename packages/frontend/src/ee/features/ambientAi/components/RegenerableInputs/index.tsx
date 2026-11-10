import {
    ActionIcon,
    Box,
    Textarea,
    TextInput,
    Tooltip,
    type TextareaProps,
    type TextInputProps,
} from '@mantine/core';
import { useElementSize, useMergedRef } from '@mantine/hooks';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../../../hooks/useIsTruncated';
import { type RegenerateAction } from '../../hooks/useRegenerateChartMetadata';
import classes from './RegenerableInputs.module.css';

const RegenerateButton: FC<
    RegenerateAction & { onHoverChange?: (isHovered: boolean) => void }
> = ({ label, onClick, loading, disabled, onHoverChange }) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    // A loading button is disabled, which drops keyboard focus to the page.
    // Give it back once generating ends, for keyboard users only.
    const hadKeyboardFocusRef = useRef(false);
    useEffect(() => {
        if (loading || !hadKeyboardFocusRef.current) return;
        hadKeyboardFocusRef.current = false;
        if (document.activeElement === document.body) {
            buttonRef.current?.focus();
        }
    }, [loading]);

    return (
        <Box
            component="span"
            className={classes.action}
            // Stay visible while generating, even if the pointer leaves
            data-visible={loading || undefined}
            onMouseEnter={() => onHoverChange?.(true)}
            onMouseLeave={() => onHoverChange?.(false)}
        >
            <Tooltip label={label}>
                <ActionIcon
                    ref={buttonRef}
                    type="button"
                    size="sm"
                    aria-label={label}
                    loading={loading}
                    disabled={disabled}
                    onClick={() => {
                        hadKeyboardFocusRef.current =
                            buttonRef.current?.matches(':focus-visible') ??
                            false;
                        onClick();
                    }}
                >
                    <MantineIcon icon={IconRefresh} />
                </ActionIcon>
            </Tooltip>
        </Box>
    );
};

type RegenerableNameInputProps = Omit<
    TextInputProps,
    'rightSection' | 'inputContainer' | 'classNames'
> & {
    /** Leave unset when regenerating is unavailable: a plain input then. */
    regenerate?: RegenerateAction;
};

/**
 * Chart name input with an AI regenerate button inside its right end, shown
 * while the input is hovered. A name too long for the input shows
 * its end while not being edited, and its full text on hover.
 */
export const RegenerableNameInput: FC<RegenerableNameInputProps> = ({
    regenerate,
    onFocus,
    onBlur,
    ...props
}) => {
    const isEnabled = regenerate !== undefined;
    const inputRef = useRef<HTMLInputElement>(null);
    const { ref: sizeRef, width } = useElementSize<HTMLInputElement>();
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLInputElement>(
        undefined,
        props.value,
    );
    const ref = useMergedRef(inputRef, sizeRef, truncatedRef);
    const [isFocused, setIsFocused] = useState(false);
    const [isOverButton, setIsOverButton] = useState(false);

    // An input keeps whatever scroll offset it had, so after an edit, a new
    // value or a resize, pin a long name to its end (cut off on the left)
    const showEnd = (input: HTMLInputElement) => {
        input.scrollLeft = input.scrollWidth;
    };
    useEffect(() => {
        const input = inputRef.current;
        if (!isEnabled || !input || document.activeElement === input) return;
        showEnd(input);
    }, [isEnabled, props.value, width]);

    return (
        <TextInput
            {...props}
            ref={ref}
            onFocus={(event) => {
                setIsFocused(true);
                onFocus?.(event);
            }}
            onBlur={(event) => {
                setIsFocused(false);
                if (isEnabled) showEnd(event.currentTarget);
                onBlur?.(event);
            }}
            classNames={isEnabled ? { wrapper: classes.wrapper } : undefined}
            // The section ignores the pointer by default, which would leave
            // the button unclickable
            rightSectionPointerEvents={isEnabled ? 'all' : undefined}
            rightSection={
                regenerate && (
                    <RegenerateButton
                        {...regenerate}
                        onHoverChange={setIsOverButton}
                    />
                )
            }
            inputContainer={
                isEnabled
                    ? (input) => (
                          <Tooltip
                              label={String(props.value ?? '')}
                              // One tooltip at a time: the button has its own
                              disabled={
                                  !isTruncated || isFocused || isOverButton
                              }
                          >
                              <Box>{input}</Box>
                          </Tooltip>
                      )
                    : undefined
            }
        />
    );
};

type RegenerableDescriptionInputProps = Omit<
    TextareaProps,
    'rightSection' | 'classNames'
> & {
    /** Leave unset when regenerating is unavailable: a plain textarea then. */
    regenerate?: RegenerateAction;
};

/**
 * Chart description textarea with an AI regenerate button inside its top
 * right corner, shown while the textarea is hovered.
 */
export const RegenerableDescriptionInput: FC<
    RegenerableDescriptionInputProps
> = ({ regenerate, ...props }) => (
    <Textarea
        {...props}
        classNames={
            regenerate
                ? {
                      wrapper: classes.wrapper,
                      section: classes.textareaSection,
                      input: classes.hiddenScrollbar,
                  }
                : undefined
        }
        rightSectionPointerEvents={regenerate ? 'all' : undefined}
        rightSection={regenerate && <RegenerateButton {...regenerate} />}
    />
);
