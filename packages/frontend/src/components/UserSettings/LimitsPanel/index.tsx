import {
    type OrganizationSettings,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { Button, Group, Loader, NumberInput, Stack } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';

/**
 * Editable form for the org's export limits. Split out from the panel so the
 * form's initial values are captured from the loaded settings exactly once
 * (keyed remount on the effective values), never clobbered by a refetch.
 *
 * The caps come from /health (instance env): `queryRowsCap` is
 * LIGHTDASH_QUERY_MAX_LIMIT and `csvCellsCap` is
 * max(LIGHTDASH_CSV_MAX_LIMIT, LIGHTDASH_CSV_CELLS_LIMIT). Both are always ≥ the
 * org's current value, so they can be used directly as the input max.
 */
const LimitsForm: FC<{
    settings: OrganizationSettings;
    queryRowsCap: number;
    csvCellsCap: number;
}> = ({ settings, queryRowsCap, csvCellsCap }) => {
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
                    description={`The most rows a single query or export can return for your organization. Up to ${queryRowsCap.toLocaleString()}.`}
                    min={1}
                    max={queryRowsCap}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
                    thousandSeparator=","
                    {...form.getInputProps('queryMaxLimit')}
                />
                <NumberInput
                    label="Maximum CSV / Excel cells"
                    description={`The most cells (rows × columns) a CSV or Excel export can contain. Up to ${csvCellsCap.toLocaleString()}.`}
                    min={1}
                    max={csvCellsCap}
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
    const health = useHealth();

    if (isInitialLoading || !data || !health.data) {
        return <Loader />;
    }

    // Remount when the effective values change so the form re-seeds from server
    // state without a clobbering useEffect.
    return (
        <LimitsForm
            key={`${data.queryMaxLimit}-${data.csvCellsLimit}`}
            settings={data}
            queryRowsCap={health.data.query.maxLimit}
            csvCellsCap={health.data.query.csvMaxLimit}
        />
    );
};

export default LimitsPanel;
