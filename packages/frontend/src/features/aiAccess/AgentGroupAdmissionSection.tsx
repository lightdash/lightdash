import {
    isGroupWithMembers,
    type Group as OrganizationGroup,
} from '@lightdash/common';
import {
    Button,
    Group,
    MultiSelect,
    Radio,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import Callout from '../../components/common/Callout';

interface GroupPickerProps {
    groups: OrganizationGroup[];
    selection: string[] | null;
    onChange: (selection: string[] | null) => void;
    disabled: boolean;
    invalid: boolean;
}
interface GroupAdmissionProps extends GroupPickerProps {
    available: boolean;
    savedSelection: string[] | null;
}
const groupOptions = (
    groups: OrganizationGroup[],
    selection: string[] | null,
) => {
    const options = groups.map((group) => ({
        value: group.uuid,
        label: isGroupWithMembers(group)
            ? `${group.name} (${new Set(group.memberUuids).size})`
            : group.name,
    }));
    const visible = new Set(groups.map((group) => group.uuid));
    return [
        ...options,
        ...(selection ?? [])
            .filter((uuid) => !visible.has(uuid))
            .map((uuid) => ({ value: uuid, label: 'A saved group' })),
    ];
};
const AgentGroupPicker = ({
    groups,
    selection,
    onChange,
    disabled,
    invalid,
}: GroupPickerProps) => (
    <>
        <Radio.Group
            value={selection === null ? 'everyone' : 'groups'}
            aria-label="Who can use agents"
        >
            <Stack gap="sm">
                <Radio.Card
                    value="everyone"
                    p="md"
                    disabled={disabled}
                    aria-label="Everyone whose role allows AI"
                    onClick={() => onChange(null)}
                >
                    <Group wrap="nowrap">
                        <Radio.Indicator />
                        <Stack gap={0}>
                            <Text fw={500}>Everyone whose role allows AI</Text>
                            <Text size="sm" c="dimmed">
                                Anyone with a role that allows AI can use
                                agents.
                            </Text>
                        </Stack>
                    </Group>
                </Radio.Card>
                <Radio.Card
                    value="groups"
                    p="md"
                    disabled={disabled}
                    aria-label="Only these groups"
                    onClick={() => {
                        if (selection === null) onChange([]);
                    }}
                >
                    <Group wrap="nowrap">
                        <Radio.Indicator />
                        <Stack gap={0}>
                            <Text fw={500}>Only these groups</Text>
                            <Text size="sm" c="dimmed">
                                People must belong to at least one of these
                                groups. Their role must also allow AI.
                            </Text>
                        </Stack>
                    </Group>
                </Radio.Card>
            </Stack>
        </Radio.Group>
        {selection !== null && (
            <Stack gap="xs">
                <MultiSelect
                    aria-label="Groups"
                    placeholder="Choose groups..."
                    data={groupOptions(groups, selection)}
                    value={selection}
                    onChange={onChange}
                    searchable
                    disabled={disabled}
                    error={invalid ? 'Choose at least one group.' : null}
                    nothingFoundMessage="No groups available"
                />
                {groups.length === 0 && (
                    <Text size="sm">No groups available</Text>
                )}
                <Text size="sm" c="dimmed">
                    Only members of these groups can use Ask AI, the Slack
                    agent, MCP clients and the CLI.
                </Text>
            </Stack>
        )}
    </>
);
export const AgentGroupAdmissionSection = ({
    available,
    groups,
    selection,
    savedSelection,
    onChange,
    disabled,
    invalid,
}: GroupAdmissionProps) => {
    if (!available && savedSelection === null) return null;
    const deleted = selection?.length === 0 && savedSelection?.length === 0;
    const notice = deleted ? (
        <Callout variant="warning">
            No one can use agents. All chosen groups are deleted.
        </Callout>
    ) : null;
    if (!available)
        return (
            <Stack gap="sm">
                <Text size="sm">
                    Groups are unavailable. The saved group restriction still
                    applies.
                </Text>
                {notice}
                <Button
                    variant="default"
                    disabled={disabled || selection === null}
                    onClick={() => onChange(null)}
                >
                    Allow everyone
                </Button>
            </Stack>
        );
    return (
        <Stack gap="sm">
            <Title order={5}>Who can use agents</Title>
            {notice}
            <AgentGroupPicker
                groups={groups}
                selection={selection}
                onChange={onChange}
                disabled={disabled}
                invalid={invalid}
            />
        </Stack>
    );
};
