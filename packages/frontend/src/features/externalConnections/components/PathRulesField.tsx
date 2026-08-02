import {
    ActionIcon,
    Button,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    makePathPrefix,
    type PathMode,
    type PathPrefix,
} from '../utils/pathRules';

type Props = {
    label: string;
    mode: PathMode;
    onModeChange: (mode: PathMode) => void;
    prefixes: PathPrefix[];
    onPrefixesChange: (prefixes: PathPrefix[]) => void;
    error?: ReactNode;
    disabled?: boolean;
};

/** "Allow all paths" vs "Restrict to specific paths" toggle plus the dynamic
 *  prefix list. Controlled, so the wizard and Edit form can each wire it into
 *  their own form state. */
export const PathRulesField: FC<Props> = ({
    label,
    mode,
    onModeChange,
    prefixes,
    onPrefixesChange,
    error,
    disabled,
}) => (
    <Stack gap={4}>
        <Text fz="sm" fw={500}>
            {label}
        </Text>
        <SegmentedControl
            fullWidth
            disabled={disabled}
            data={[
                { value: 'all', label: 'Allow all paths' },
                { value: 'restricted', label: 'Restrict to specific paths' },
            ]}
            value={mode}
            onChange={(value) => {
                const next = value as PathMode;
                onModeChange(next);
                // Surface an empty row immediately so the user has somewhere to type.
                if (next === 'restricted' && prefixes.length === 0) {
                    onPrefixesChange([makePathPrefix()]);
                }
            }}
        />
        {mode === 'restricted' && (
            <Stack gap="xs" mt="xs">
                <Text c="ldGray.6" fz="xs">
                    Apps may only call paths that start with one of these
                    prefixes.
                </Text>
                {prefixes.map((prefix) => (
                    <Group key={prefix.uuid} gap="xs" wrap="nowrap">
                        <TextInput
                            w="100%"
                            placeholder="/v1/"
                            disabled={disabled}
                            value={prefix.value}
                            onChange={(e) =>
                                onPrefixesChange(
                                    prefixes.map((p) =>
                                        p.uuid === prefix.uuid
                                            ? {
                                                  ...p,
                                                  value: e.currentTarget.value,
                                              }
                                            : p,
                                    ),
                                )
                            }
                        />
                        <ActionIcon
                            color="red"
                            variant="subtle"
                            disabled={disabled}
                            onClick={() =>
                                onPrefixesChange(
                                    prefixes.filter(
                                        (p) => p.uuid !== prefix.uuid,
                                    ),
                                )
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                ))}
                {error && (
                    <Text c="red" fz="xs">
                        {error}
                    </Text>
                )}
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    style={{ alignSelf: 'flex-start' }}
                    disabled={disabled}
                    onClick={() =>
                        onPrefixesChange([...prefixes, makePathPrefix()])
                    }
                >
                    Add path prefix
                </Button>
            </Stack>
        )}
    </Stack>
);
