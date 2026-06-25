import {
    ActionIcon,
    Box,
    Group,
    Menu,
    TextInput,
    type TextInputProps,
} from '@mantine-8/core';
import { IconPencil, IconVariable } from '@tabler/icons-react';
import { useRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './EditableText.module.css';

type Props = TextInputProps & {
    lighter?: boolean;
    // Base date dimension ids on the chart. When provided, an "insert variable"
    // menu offers the `${field.granularity}` tokens this label supports.
    granularityFields?: string[];
};

export const EditableText: FC<Props> = ({
    lighter,
    granularityFields,
    ...props
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleIconClick = () => {
        inputRef.current?.focus();
    };

    const hasGranularity = !!granularityFields && granularityFields.length > 0;

    const insertGranularityToken = (field: string) => {
        const input = inputRef.current;
        if (!input) return;
        const token = `\${${field}.granularity}`;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
        // Update the controlled input through the native value setter so the
        // consumer's onChange fires with the inserted value.
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set;
        valueSetter?.call(input, nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const caret = start + token.length;
        input.focus();
        input.setSelectionRange(caret, caret);
    };

    const pencil = (
        <MantineIcon
            className={styles.action}
            color="ldGray.6"
            icon={IconPencil}
            onClick={handleIconClick}
        />
    );

    return (
        <Box className={styles.root}>
            <TextInput
                size="xs"
                {...props}
                ref={inputRef}
                classNames={{
                    input: lighter
                        ? `${styles.input} ${styles.lighter}`
                        : styles.input,
                }}
                rightSectionWidth={hasGranularity ? 48 : undefined}
                rightSection={
                    hasGranularity ? (
                        <Group gap={2} wrap="nowrap">
                            <Menu
                                withinPortal
                                position="bottom-end"
                                shadow="sm"
                            >
                                <Menu.Target>
                                    <ActionIcon
                                        className={styles.action}
                                        size="xs"
                                        variant="subtle"
                                        color="ldGray.6"
                                    >
                                        <MantineIcon icon={IconVariable} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>
                                        Insert date granularity
                                    </Menu.Label>
                                    {granularityFields.map((field) => (
                                        <Menu.Item
                                            key={field}
                                            onClick={() =>
                                                insertGranularityToken(field)
                                            }
                                        >
                                            {`\${${field}.granularity}`}
                                        </Menu.Item>
                                    ))}
                                </Menu.Dropdown>
                            </Menu>
                            {pencil}
                        </Group>
                    ) : (
                        pencil
                    )
                }
            />
        </Box>
    );
};
