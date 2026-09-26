import {
    getDataAppVizFieldIds,
    getErrorMessage,
    type DataAppVizContext,
    type DataAppVizSchema,
} from '@lightdash/common';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import { PalettePicker } from '../../../components/common/PalettePicker/PalettePicker';
import DataAppVizOptionTabs from '../../../components/VisualizationConfigs/DataAppVizConfig/DataAppVizOptionTabs';
import { useDataAppVizTestContext } from '../hooks/useDataAppVizTestContext';
import DataAppVizTestFieldOptions from './DataAppVizTestFieldOptions';
import DataAppVizTestInputs from './DataAppVizTestInputs';

type Props = {
    projectUuid: string;
    schema: DataAppVizSchema;
    onContextChange: (ctx: DataAppVizContext | null) => void;
};

// Interactive panel below the viz result card: pick an explore, map each
// declared field to a dimension/metric, set any declared config option, run one
// query, and push the resulting context into the generator preview via
// `onContextChange`.
const DataAppVizTestPanel: FC<Props> = ({
    projectUuid,
    schema,
    onContextChange,
}) => {
    const state = useDataAppVizTestContext({
        projectUuid,
        schema,
        onContextChange,
    });
    const {
        exploreName,
        effectiveOptions,
        setOption,
        colorPaletteUuid,
        setColorPaletteUuid,
        palettes,
        colorPalette,
        handleRun,
        complete,
        isRunning,
        error,
    } = state;

    return (
        <Card radius="md" p="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600}>
                    Visualization ready
                </Text>

                <DataAppVizOptionTabs
                    generalContent={
                        <DataAppVizTestInputs schema={schema} state={state} />
                    }
                    configOptions={schema.configOptions}
                    values={effectiveOptions}
                    onChange={setOption}
                    colorPalette={schema.colorPalette}
                    resolvedColorPalette={colorPalette}
                    fields={schema.fields}
                    fieldMapping={state.fieldMapping}
                    renderFieldOptions={(group) =>
                        schema.fields.map(
                            (field) =>
                                (field.configOptions ?? []).some(
                                    (option) => option.group === group,
                                ) &&
                                getDataAppVizFieldIds(
                                    state.fieldMapping[field.name],
                                ).length > 0 && (
                                    <Stack key={field.name} gap="xs">
                                        <Text fz="xs" fw={600}>
                                            {field.label}
                                        </Text>
                                        <DataAppVizTestFieldOptions
                                            field={field}
                                            group={group}
                                            state={state}
                                        />
                                    </Stack>
                                ),
                        )
                    }
                    paletteControl={
                        <PalettePicker
                            label="Color palette"
                            value={colorPaletteUuid}
                            onChange={setColorPaletteUuid}
                            palettes={palettes}
                            parentLabel="Project default"
                            showPreview={false}
                        />
                    }
                />

                {error != null && (
                    <Callout variant="danger">{getErrorMessage(error)}</Callout>
                )}

                {exploreName && (
                    <Group justify="flex-end">
                        <Button
                            size="xs"
                            onClick={handleRun}
                            disabled={!complete || isRunning}
                            loading={isRunning}
                        >
                            Run test query
                        </Button>
                    </Group>
                )}
            </Stack>
        </Card>
    );
};

export default DataAppVizTestPanel;
