import {
    ActionIcon,
    Button,
    Group,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { type CustomHeaderRow } from '../utils/customHeaders';

type Props = {
    label: string;
    value: CustomHeaderRow[];
    onChange: (value: CustomHeaderRow[]) => void;
    error?: ReactNode;
    disabled?: boolean;
};

/** Key/value editor for a connection's static custom request headers
 *  (e.g. anthropic-version). Shared by the onboarding wizard's Auth step
 *  and the Edit connection form. */
export const CustomHeadersField: FC<Props> = ({
    label,
    value,
    onChange,
    error,
    disabled,
}) => {
    const updateRow = (index: number, patch: Partial<CustomHeaderRow>) => {
        onChange(
            value.map((row, i) => (i === index ? { ...row, ...patch } : row)),
        );
    };

    return (
        <Stack gap={4}>
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Text c="ldGray.6" fz="xs">
                Sent with every request — e.g. anthropic-version or
                X-GitHub-Api-Version. Never put secrets here; use the
                connection's authentication instead.
            </Text>
            {value.map((row, index) => (
                // Rows have no stable identity — index keys are intentional.
                // eslint-disable-next-line react/no-array-index-key
                <Group key={index} gap="xs" align="flex-start">
                    <TextInput
                        aria-label="Header name"
                        placeholder="anthropic-version"
                        style={{ flexGrow: 1 }}
                        value={row.name}
                        disabled={disabled}
                        onChange={(e) =>
                            updateRow(index, { name: e.currentTarget.value })
                        }
                    />
                    <TextInput
                        aria-label="Header value"
                        placeholder="2023-06-01"
                        style={{ flexGrow: 1 }}
                        value={row.value}
                        disabled={disabled}
                        onChange={(e) =>
                            updateRow(index, { value: e.currentTarget.value })
                        }
                    />
                    <ActionIcon
                        aria-label="Remove header"
                        variant="subtle"
                        color="ldGray.6"
                        mt={4}
                        disabled={disabled}
                        onClick={() =>
                            onChange(value.filter((_, i) => i !== index))
                        }
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Group>
            ))}
            <Group>
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    disabled={disabled}
                    onClick={() =>
                        onChange([...value, { name: '', value: '' }])
                    }
                >
                    Add header
                </Button>
            </Group>
            {error && (
                <Text c="red" fz="xs">
                    {error}
                </Text>
            )}
        </Stack>
    );
};
