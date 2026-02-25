import { ActionIcon, Box, TextInput, Tooltip } from '@mantine-8/core';
import { useDisclosure, useHover } from '@mantine-8/hooks';
import { IconListDetails } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../MantineIcon';
import {
    DefaultValue,
    type TagInputValueProps,
} from '../../TagInput/DefaultValue/DefaultValue';
import { TagInput } from '../../TagInput/TagInput';
import classes from './FilterMultiNumberInput.module.css';
import {
    computeDisplayValues,
    computeHiddenCount,
    mergeWithHiddenValues,
    MORE_VALUES_TOKEN,
    SUMMARY_MODE_THRESHOLD,
    wasTokenRemoved,
} from './FilterStringAutoComplete.utils';
import { ManageFilterValuesModal } from './ManageFilterValuesModal';

const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;
const isValidNumber = (value: string) => NUMBER_REGEX.test(value);

type Props = {
    values: string[];
    onChange: (values: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
    autoFocus?: boolean;
};

const FilterMultiNumberInput: FC<Props> = ({
    values,
    onChange,
    disabled,
    placeholder,
    autoFocus,
}) => {
    const [opened, { open, close }] = useDisclosure(false);
    const { ref, hovered } = useHover();

    const isSummaryMode = values.length > SUMMARY_MODE_THRESHOLD;
    const hiddenCount = computeHiddenCount(values);
    const displayValues = useMemo(() => computeDisplayValues(values), [values]);

    const TruncatedValue = useCallback(
        (props: TagInputValueProps & { value: string }) => {
            if (props.value === MORE_VALUES_TOKEN) {
                return (
                    <DefaultValue
                        {...props}
                        label={`+${hiddenCount.toLocaleString()} more`}
                        readOnly
                        onMouseDown={(e: React.MouseEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!disabled) open();
                        }}
                        className={classes.moreValuesPill}
                    />
                );
            }
            return <DefaultValue {...props} />;
        },
        [disabled, hiddenCount, open],
    );

    const handleChange = useCallback(
        (updatedValues: string[]) => {
            if (hiddenCount <= 0) {
                onChange(updatedValues);
                return;
            }

            // If all visible values were cleared, clear everything
            const cleaned = updatedValues.filter(
                (v) => v !== MORE_VALUES_TOKEN,
            );
            if (cleaned.length === 0) {
                onChange([]);
                return;
            }

            // If "+N more" token was removed via backspace, open modal
            if (wasTokenRemoved(displayValues, updatedValues, hiddenCount)) {
                open();
                return;
            }

            // Reconcile displayed changes with hidden values
            const merged = mergeWithHiddenValues(
                updatedValues,
                displayValues,
                values,
            );
            onChange(merged);
        },
        [hiddenCount, displayValues, values, onChange, open],
    );

    const manageButton = disabled ? undefined : (
        <Tooltip withinPortal label="Edit filter values">
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={open}
                style={{
                    visibility: hovered ? 'visible' : 'hidden',
                }}
            >
                <MantineIcon icon={IconListDetails} />
            </ActionIcon>
        </Tooltip>
    );

    return (
        <>
            <ManageFilterValuesModal
                opened={opened}
                onClose={close}
                values={values}
                onChange={onChange}
                title="Manage filter values"
                validateValue={isValidNumber}
            />

            <Box ref={ref} w="100%">
                {isSummaryMode ? (
                    <TextInput
                        size="xs"
                        w="100%"
                        readOnly
                        value={`${values.length.toLocaleString()} values selected`}
                        onClick={!disabled ? open : undefined}
                        classNames={{ input: classes.summaryInput }}
                        rightSection={manageButton}
                    />
                ) : (
                    <TagInput
                        w="100%"
                        clearable
                        autoFocus={autoFocus}
                        size="xs"
                        disabled={disabled}
                        placeholder={placeholder}
                        allowDuplicates={false}
                        validationRegex={NUMBER_REGEX}
                        classNames={{ input: classes.tagInputContainer }}
                        value={displayValues}
                        onChange={handleChange}
                        valueComponent={
                            hiddenCount > 0 ? TruncatedValue : undefined
                        }
                        rightSection={manageButton}
                    />
                )}
            </Box>
        </>
    );
};

export default FilterMultiNumberInput;
