import { getItemId, type DashboardTile } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { type FC } from 'react';
import FieldSelect from '../../components/common/FieldSelect';
import { useDashboardControls } from './context';
import { getControlTypeWord } from './controlType';
import classes from './dashboardControls.module.css';
import ItemLabel from './ItemLabel';
import { formatDisplayLabel } from './labels';

// One control on one tile: the field or parameter the tile uses for it, or
// nothing. Changes here reach this tile only.
const ControlTileMapping: FC<{ tile: DashboardTile }> = ({ tile }) => {
    const { draft, model, previewTileUuids, togglePreview } =
        useDashboardControls();
    if (!draft || !model) return null;
    const state = model.tileStates[tile.uuid];
    if (!state) return null;

    if (state.status === 'loading') return <Loader size="xs" />;

    if (state.status === 'none') {
        return (
            <Text fz="xs" c="dimmed" ta="center">
                {`No ${getControlTypeWord(draft.controlType)} ${model.noun}s`}
            </Text>
        );
    }

    // No field to pick: the tile takes the filter or not
    if (state.status === 'switch') {
        return (
            <Switch
                size="xs"
                disabled={model.isLoading}
                label={state.isOn ? 'Applies' : 'Does not apply'}
                checked={state.isOn}
                onChange={(event) =>
                    model.setTileOn(tile.uuid, event.currentTarget.checked)
                }
            />
        );
    }

    const isParameter = model.noun === 'parameter';
    const mappedId = state.status === 'mapped' ? state.itemId : null;
    const mappedDisplay = state.status === 'mapped' ? state.display : null;
    // A saved field the chart no longer has still shows as the current choice
    const options =
        mappedId !== null &&
        mappedDisplay !== null &&
        !state.options.some((option) => option.id === mappedId)
            ? [{ id: mappedId, display: mappedDisplay }, ...state.options]
            : state.options;
    const displays = new Map(options.map(({ id, display }) => [id, display]));
    const runValue = model.getTileRunValue(tile.uuid);
    const isPreviewed = previewTileUuids.includes(tile.uuid);

    // Explore fields use the product's field picker; SQL columns and a saved
    // field the chart no longer has are not fields it can show
    const fields = options.flatMap(({ id }) => {
        const field = model.getField(id);
        return field ? [field] : [];
    });
    const usesFieldSelect = !isParameter && fields.length === options.length;

    return (
        <Stack gap="xs" align="center" w="100%">
            <Group gap="xs" wrap="nowrap" w="100%" justify="center">
                <Box
                    className={classes.tilePicker}
                    data-run-value={
                        mappedId !== null && runValue ? true : undefined
                    }
                >
                    {usesFieldSelect ? (
                        <FieldSelect
                            size="xs"
                            clearable
                            disabled={model.isLoading}
                            aria-label="Field for this tile"
                            placeholder="Does not apply"
                            item={
                                mappedId !== null
                                    ? model.getField(mappedId)
                                    : undefined
                            }
                            items={fields}
                            onChange={(field) =>
                                model.setTileItem(
                                    tile.uuid,
                                    field ? getItemId(field) : null,
                                )
                            }
                        />
                    ) : (
                        <Select
                            size="xs"
                            clearable
                            disabled={model.isLoading}
                            aria-label={`${isParameter ? 'Parameter' : 'Field'} for this tile`}
                            placeholder="Does not apply"
                            value={mappedId}
                            data={options.map(({ id, display }) => ({
                                value: id,
                                label: formatDisplayLabel(display),
                            }))}
                            renderOption={({ option }) => {
                                const display = displays.get(option.value);
                                return (
                                    <Text fz="xs" truncate>
                                        {display ? (
                                            <ItemLabel display={display} />
                                        ) : (
                                            option.label
                                        )}
                                    </Text>
                                );
                            }}
                            // The value a mapped tile runs with sits beside the clear
                            // button. Keep the width in step with .tilePicker in the
                            // CSS module
                            rightSection={
                                mappedId !== null && runValue ? (
                                    <Text
                                        fz="xs"
                                        truncate
                                        className={classes.tilePickerValue}
                                        c={
                                            runValue.isMissing
                                                ? 'yellow.7'
                                                : 'dimmed'
                                        }
                                        title={runValue.text}
                                    >
                                        {runValue.text}
                                    </Text>
                                ) : undefined
                            }
                            rightSectionWidth={
                                mappedId !== null && runValue
                                    ? 'min(55%, 176px)'
                                    : undefined
                            }
                            onChange={(id) => model.setTileItem(tile.uuid, id)}
                        />
                    )}
                </Box>
            </Group>
            {runValue?.isAppliedOnSave && (
                <Text fz="xs" c="dimmed" ta="center">
                    Takes effect when the dashboard is saved
                </Text>
            )}
            <Button
                size="compact-xs"
                variant="subtle"
                aria-pressed={isPreviewed}
                onClick={() => togglePreview(tile.uuid)}
            >
                {isPreviewed ? 'Close preview' : 'Preview'}
            </Button>
        </Stack>
    );
};

export default ControlTileMapping;
