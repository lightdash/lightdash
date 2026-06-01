import {
    MAX_CSV_CELLS_LIMIT,
    type OrganizationSettings,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { Button, Group, Loader, NumberInput, Stack } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';

// Generous UI guardrail for the row limit — there's no backend cap on it (only
// the CSV cells limit is capped, at MAX_CSV_CELLS_LIMIT).
const MAX_QUERY_ROWS = 10000000;

/**
 * Editable form for the org's export limits. Split out from the panel so the
 * form's initial values are captured from the loaded settings exactly once
 * (keyed remount on the effective values), never clobbered by a refetch.
 */
const LimitsForm: FC<{ settings: OrganizationSettings }> = ({ settings }) => {
    const update = useUpdateOrganizationSettings();

    // The API returns effective numbers (org override resolved against the env),
    // so these are always set; the shared type is nullable for the raw row.
    const initial = {
        queryMaxLimit: settings.queryMaxLimit ?? 5000,
        csvCellsLimit: settings.csvCellsLimit ?? 100000,
    };
    const form = useForm({ initialValues: initial });

    const handleSubmit = form.onSubmit((values) => {
        const patch: UpdateOrganizationSettings = {
            queryMaxLimit: values.queryMaxLimit,
            csvCellsLimit: values.csvCellsLimit,
        };
        update.mutate(patch);
    });

    const isUnchanged =
        form.values.queryMaxLimit === initial.queryMaxLimit &&
        form.values.csvCellsLimit === initial.csvCellsLimit;

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="lg">
                <NumberInput
                    label="Maximum query rows"
                    description="The most rows a single query or export can return for your organization."
                    min={1}
                    max={MAX_QUERY_ROWS}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
                    thousandSeparator=","
                    {...form.getInputProps('queryMaxLimit')}
                />
                <NumberInput
                    label="Maximum CSV / Excel cells"
                    description={`The most cells (rows × columns) a CSV or Excel export can contain. Up to ${MAX_CSV_CELLS_LIMIT.toLocaleString()}.`}
                    min={1}
                    max={MAX_CSV_CELLS_LIMIT}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
                    thousandSeparator=","
                    {...form.getInputProps('csvCellsLimit')}
                />
                <Group justify="flex-end">
                    <Button
                        type="submit"
                        loading={update.isLoading}
                        disabled={isUnchanged}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const LimitsPanel: FC = () => {
    const { data, isInitialLoading } = useOrganizationSettings();

    if (isInitialLoading || !data) {
        return <Loader />;
    }

    // Remount when the effective values change so the form re-seeds from server
    // state without a clobbering useEffect.
    return (
        <LimitsForm
            key={`${data.queryMaxLimit}-${data.csvCellsLimit}`}
            settings={data}
        />
    );
};

export default LimitsPanel;
