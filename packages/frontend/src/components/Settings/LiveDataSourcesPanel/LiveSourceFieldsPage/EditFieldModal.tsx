import { type LiveSourceField } from '@lightdash/common';
import {
    Autocomplete,
    Button,
    Group,
    Stack,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineModal from '../../../common/MantineModal';
import {
    formatChartCount,
    formatFieldType,
    type EditableField,
} from './liveSourceFieldsView';

type Props = {
    field: LiveSourceField;
    groups: string[];
    isSaving: boolean;
    onSave: (next: EditableField) => void;
    onStopUsing: () => void;
    onClose: () => void;
};

const EditFieldModal: FC<Props> = ({
    field,
    groups,
    isSaving,
    onSave,
    onStopUsing,
    onClose,
}) => {
    const [value, setValue] = useState<EditableField>({
        label: field.label,
        description: field.description,
        aiHint: field.aiHint,
        group: field.group,
    });
    const kind = field.kind === 'metric' ? 'Metric' : 'Dimension';
    const usage =
        field.usedByChartCount > 0
            ? `Used by ${formatChartCount(field.usedByChartCount)}`
            : 'Not used by any chart';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`Edit ${field.label}`}
            subtitle={`${kind} · ${formatFieldType(field)} · ${usage}`}
            icon={IconPencil}
            size="lg"
            confirmLabel="Save"
            confirmLoading={isSaving}
            confirmDisabled={!value.label.trim()}
            onConfirm={() => onSave(value)}
            leftActions={
                <Tooltip
                    label="Every query filters by this field"
                    disabled={!field.isRequired}
                >
                    <Button
                        variant="subtle"
                        color="red"
                        disabled={field.isRequired}
                        onClick={onStopUsing}
                    >
                        Stop using field
                    </Button>
                </Tooltip>
            }
        >
            <Stack gap="sm">
                <TextInput label="Source" value={field.apiName} disabled />
                <Group grow align="flex-start">
                    <TextInput
                        label="Label"
                        required
                        value={value.label}
                        onChange={(event) =>
                            setValue({
                                ...value,
                                label: event.currentTarget.value,
                            })
                        }
                    />
                    <Autocomplete
                        label="Group"
                        placeholder="No group"
                        data={groups}
                        value={value.group ?? ''}
                        onChange={(group) => setValue({ ...value, group })}
                    />
                </Group>
                <Textarea
                    label="Description"
                    autosize
                    minRows={2}
                    value={value.description}
                    onChange={(event) =>
                        setValue({
                            ...value,
                            description: event.currentTarget.value,
                        })
                    }
                />
                <Textarea
                    label="AI hint"
                    description="Guidance only AI agents see, such as which values count as paid."
                    autosize
                    minRows={2}
                    value={value.aiHint ?? ''}
                    onChange={(event) =>
                        setValue({
                            ...value,
                            aiHint: event.currentTarget.value,
                        })
                    }
                />
            </Stack>
        </MantineModal>
    );
};

export default EditFieldModal;
