import { getEffectiveOptionValues, type ItemsMap } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import DataAppVizDock from '../../../features/apps/components/DataAppVizDock';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../../../features/apps/utils/autoMapDataAppVizFields';
import { isDataAppVizVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { getVizConfigThemeOverride } from '../mantineTheme';
import classes from './DataAppVizConfigTabs.module.css';
import DataAppVizOptionTabs from './DataAppVizOptionTabs';
import DataAppVizSettings from './DataAppVizSettings';

// Stable identity, so the field pools stay memoized before results land.
const NO_COLUMNS: ItemsMap = {};

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    const isDataAppViz = isDataAppVizVisualizationConfig(visualizationConfig);
    const dataAppVizUuid = isDataAppViz
        ? visualizationConfig.chartConfig.dataAppVizUuid
        : '';

    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid || undefined,
    );

    const configOptions = useMemo(
        () => dataAppViz?.schema?.configOptions ?? [],
        [dataAppViz],
    );
    const colorPalette = dataAppViz?.schema?.colorPalette ?? null;

    const canCreateApp = useCanCreateDataApp(projectUuid);
    const canEditSelected = useCanEditDataApp(projectUuid, {
        spaceUuid: dataAppViz?.spaceUuid ?? null,
        createdByUserUuid: dataAppViz?.createdByUserUuid ?? null,
    });
    // The dock is authoring end to end — the version log's restores, the way
    // into the builder — so it is offered on the same rules as the builder
    // page: creating a new visualization, or managing the one selected.
    // Without either, the panel is the picker and the settings. The create
    // arm only becomes reachable once the dock renders with nothing selected.
    const canAuthor = dataAppVizUuid ? canEditSelected : canCreateApp;

    if (!isDataAppViz) return null;

    const {
        setDataAppVizUuid,
        setField,
        setOption,
        fieldMapping,
        optionValues,
    } = visualizationConfig.chartConfig;
    const fields = dataAppViz?.schema?.fields ?? [];
    const effectiveValues = getEffectiveOptionValues(
        configOptions,
        optionValues,
    );
    // The contract can change under a stable uuid when the viz is rebuilt, so
    // what the selects show is the saved mapping reconciled against the
    // contract and columns in force now — the same value the renderer uses.
    const effectiveMapping = reconcileDataAppVizFieldMapping(
        fields,
        itemsMap ?? NO_COLUMNS,
        fieldMapping,
    );

    const settings = (
        <DataAppVizSettings
            projectUuid={projectUuid ?? ''}
            dataAppVizUuid={dataAppVizUuid}
            dataAppViz={dataAppViz ?? null}
            itemsMap={itemsMap ?? NO_COLUMNS}
            fields={fields}
            fieldMapping={effectiveMapping}
            onSelect={(picked) =>
                setDataAppVizUuid(
                    picked?.dataAppVizUuid ?? '',
                    picked
                        ? autoMapDataAppVizFields(
                              picked.schema?.fields ?? [],
                              itemsMap ?? NO_COLUMNS,
                          )
                        : {},
                )
            }
            onFieldChange={setField}
        />
    );

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Box className={classes.panel}>
                <Box className={classes.settings}>
                    <DataAppVizOptionTabs
                        // Remount on a viz switch so no control keeps the
                        // previous viz's draft edit.
                        key={dataAppVizUuid}
                        generalContent={settings}
                        configOptions={configOptions}
                        values={effectiveValues}
                        onChange={(name, value) =>
                            setOption(dataAppVizUuid, name, value)
                        }
                        colorPalette={colorPalette}
                        paletteControl={<ColorPaletteSection />}
                    />
                </Box>

                {dataAppVizUuid && canAuthor && (
                    <DataAppVizDock
                        projectUuid={projectUuid ?? ''}
                        dataAppVizUuid={dataAppVizUuid}
                    />
                )}
            </Box>
        </MantineProvider>
    );
});
