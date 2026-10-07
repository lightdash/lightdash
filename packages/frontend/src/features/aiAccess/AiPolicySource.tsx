import { type UpsertAiAccessPolicy } from '@lightdash/common';
import { Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
export const AiPolicySource = ({
    value,
    set,
}: {
    value: UpsertAiAccessPolicy;
    set: (patch: Partial<UpsertAiAccessPolicy>) => void;
}) => {
    const [editingSource, setEditingSource] = useState(false);
    return (
        <Stack gap="sm">
            <Group justify="space-between">
                <Stack gap={4}>
                    <Text fw={500} size="sm">
                        Policy owner (optional)
                    </Text>
                    <Text c="dimmed" fz="xs">
                        Tell admins where the warehouse rules are managed.
                    </Text>
                </Stack>
                <Button
                    variant="subtle"
                    onClick={() => setEditingSource(!editingSource)}
                >
                    {editingSource ? 'Done' : 'Edit'}
                </Button>
            </Group>
            {editingSource ? (
                <>
                    <TextInput
                        label="Policy source label"
                        value={value.policySource?.label ?? ''}
                        onChange={(event) =>
                            set({
                                policySource: {
                                    label: event.currentTarget.value,
                                    url: value.policySource?.url ?? null,
                                },
                            })
                        }
                    />
                    <TextInput
                        label="Policy source URL"
                        type="url"
                        value={value.policySource?.url ?? ''}
                        onChange={(event) =>
                            set({
                                policySource: {
                                    label: value.policySource?.label ?? '',
                                    url: event.currentTarget.value || null,
                                },
                            })
                        }
                    />
                    <Button
                        variant="subtle"
                        onClick={() => set({ policySource: null })}
                    >
                        Clear source
                    </Button>
                </>
            ) : value.policySource ? (
                value.policySource.url &&
                /^https?:\/\//i.test(value.policySource.url) ? (
                    <Anchor
                        href={value.policySource.url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {value.policySource.label}
                    </Anchor>
                ) : (
                    <Text>{value.policySource.label}</Text>
                )
            ) : (
                <Text c="dimmed">No policy source set.</Text>
            )}
        </Stack>
    );
};
