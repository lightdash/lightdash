import { type AgentPilotSelection } from '@lightdash/common';
import { MultiSelect, Radio, Stack } from '@mantine/core';

export type AgentPickerOption = { value: string; label: string };
export const AgentAccessPickers = ({
    selection,
    projects,
    people,
    onChange,
    disabled,
}: {
    selection: AgentPilotSelection;
    projects: AgentPickerOption[];
    people: AgentPickerOption[];
    onChange: (selection: AgentPilotSelection) => void;
    disabled: boolean;
}) => (
    <Stack gap="md">
        <Radio.Group
            label="Allowed projects"
            value={selection.allowedProjectUuids === null ? 'all' : 'selected'}
            onChange={(value) =>
                onChange({
                    ...selection,
                    allowedProjectUuids: value === 'all' ? null : [],
                })
            }
        >
            <Stack gap="xs" mt="xs">
                <Radio value="all" label="All projects" disabled={disabled} />
                <Radio
                    value="selected"
                    label="Only these projects"
                    disabled={disabled}
                />
            </Stack>
        </Radio.Group>
        {selection.allowedProjectUuids !== null && (
            <MultiSelect
                label="Projects"
                clearable
                clearButtonProps={{ 'aria-label': 'Clear projects' }}
                data={projects}
                searchable
                value={selection.allowedProjectUuids}
                onChange={(value) =>
                    onChange({ ...selection, allowedProjectUuids: value })
                }
                disabled={disabled}
            />
        )}
        <Radio.Group
            label="Pilot users"
            value={selection.allowedUserUuids === null ? 'all' : 'selected'}
            onChange={(value) =>
                onChange({
                    ...selection,
                    allowedUserUuids: value === 'all' ? null : [],
                })
            }
        >
            <Stack gap="xs" mt="xs">
                <Radio
                    value="all"
                    label="Everyone the roles allow"
                    disabled={disabled}
                />
                <Radio
                    value="selected"
                    label="Only these people"
                    disabled={disabled}
                />
            </Stack>
        </Radio.Group>
        {selection.allowedUserUuids !== null && (
            <MultiSelect
                label="People"
                clearable
                clearButtonProps={{ 'aria-label': 'Clear people' }}
                data={people}
                searchable
                value={selection.allowedUserUuids}
                onChange={(value) =>
                    onChange({ ...selection, allowedUserUuids: value })
                }
                disabled={disabled}
            />
        )}
    </Stack>
);
