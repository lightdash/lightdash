import { SegmentedControl, Stack, Text, Textarea } from '@mantine-8/core';
import { IconList } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import { useCallback, useEffect, useState, type FC } from 'react';
import MantineModal from '../../MantineModal';

type Separator = 'newline' | 'comma';

type Props = {
    opened: boolean;
    onClose: () => void;
    values: string[];
    onApply: (values: string[]) => void;
    isNumberField?: boolean;
};

const serializeValues = (vals: string[], sep: Separator): string => {
    const sepChar = sep === 'newline' ? '\n' : ', ';
    return vals.join(sepChar);
};

const parseValues = (
    text: string,
    sep: Separator,
    isNumberField?: boolean,
): string[] => {
    const regex = sep === 'newline' ? /\n/ : /\s*,\s*/;
    const values = text
        .split(regex)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    if (isNumberField) {
        return values.filter((v) => !isNaN(parseFloat(v)));
    }
    return values;
};

const BulkEditValuesModal: FC<Props> = ({
    opened,
    onClose,
    values,
    onApply,
    isNumberField,
}) => {
    const [separator, setSeparator] = useState<Separator>('newline');
    const [text, setText] = useState('');

    // Sync text when modal opens or values change while open
    useEffect(() => {
        if (opened) {
            setText(serializeValues(values, separator));
        }
    }, [opened, values, separator]);

    const handleSeparatorChange = useCallback(
        (newSep: string) => {
            const parsed = parseValues(text, separator, isNumberField);
            setSeparator(newSep as Separator);
            setText(serializeValues(parsed, newSep as Separator));
        },
        [text, separator, isNumberField],
    );

    const handleApply = useCallback(() => {
        const parsed = parseValues(text, separator, isNumberField);
        onApply(uniq(parsed));
        onClose();
    }, [text, separator, isNumberField, onApply, onClose]);

    const valueCount = uniq(parseValues(text, separator, isNumberField)).length;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Edit filter values"
            icon={IconList}
            size="xl"
            onConfirm={handleApply}
            confirmLabel="Apply"
        >
            <Stack gap="md">
                <SegmentedControl
                    size="xs"
                    radius="md"
                    data={[
                        { value: 'newline', label: 'One per line' },
                        { value: 'comma', label: 'Comma-separated' },
                    ]}
                    value={separator}
                    onChange={handleSeparatorChange}
                />
                <Textarea
                    autoFocus
                    minRows={10}
                    maxRows={20}
                    autosize
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                    placeholder={
                        separator === 'newline'
                            ? 'Enter one value per line'
                            : 'Enter values separated by commas'
                    }
                />
                <Text size="xs" c="dimmed">
                    {valueCount} {valueCount === 1 ? 'value' : 'values'}
                </Text>
            </Stack>
        </MantineModal>
    );
};

export default BulkEditValuesModal;
