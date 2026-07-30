import {
    getEffectiveOptionValues,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { memo, useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import DataAppVizBuildStatus from '../../../features/apps/components/DataAppVizBuildStatus';
import DataAppVizComposer from '../../../features/apps/components/DataAppVizComposer';
import DataAppVizDock from '../../../features/apps/components/DataAppVizDock';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../../../features/apps/hooks/useDataAppVisualization';
import { useDataAppVizBuild } from '../../../features/apps/hooks/useDataAppVizBuild';
import { useElapsedClock } from '../../../features/apps/hooks/useElapsedClock';
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

    const { data: dataAppViz, isLoading: isDataAppVizLoading } =
        useDataAppVisualization(projectUuid, dataAppVizUuid || undefined);

    const configOptions = useMemo(
        () => dataAppViz?.schema?.configOptions ?? [],
        [dataAppViz],
    );
    const colorPalette = dataAppViz?.schema?.colorPalette ?? null;

    // Held in a ref-free callback so the build hook can commit straight into
    // the chart config once a new visualization lands.
    const setDataAppVizUuidRef = isDataAppViz
        ? visualizationConfig.chartConfig.setDataAppVizUuid
        : undefined;
    const [builtHere, setBuiltHere] = useState<string | null>(null);
    const handleCreated = useCallback(
        (uuid: string, mapping: DataAppVizFieldMapping) => {
            setBuiltHere(uuid);
            setDataAppVizUuidRef?.(uuid, mapping);
        },
        [setDataAppVizUuidRef],
    );
    const build = useDataAppVizBuild({
        projectUuid,
        itemsMap: itemsMap ?? {},
        dataAppVizUuid: dataAppVizUuid || null,
        onCreated: handleCreated,
    });
    const elapsed = useElapsedClock(build.startedAt);
    const canCreateApp = useCanCreateDataApp(projectUuid);
    const canEditSelected = useCanEditDataApp(projectUuid, {
        spaceUuid: dataAppViz?.spaceUuid ?? null,
        createdByUserUuid: dataAppViz?.createdByUserUuid ?? null,
    });
    // The dock is authoring end to end — the composer, the version log's
    // restores, the way into the builder — so it is offered on the same rules
    // as the builder page: creating a new visualization, or managing the one
    // selected. Without either, the panel is the picker and the settings.
    const canAuthor = dataAppVizUuid
        ? canEditSelected ||
          (dataAppVizUuid === builtHere && isDataAppVizLoading)
        : canCreateApp;

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

    const draft = build.draft;

    const settings = (
        <DataAppVizSettings
            projectUuid={projectUuid ?? ''}
            dataAppVizUuid={dataAppVizUuid}
            dataAppViz={dataAppViz ?? null}
            itemsMap={itemsMap ?? NO_COLUMNS}
            fields={fields}
            fieldMapping={effectiveMapping}
            draft={draft ? { dataAppVizUuid: draft.appUuid, elapsed } : null}
            onSelectDraft={() => setDataAppVizUuid('', {})}
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

                {canAuthor && (
                    <DataAppVizDock
                        projectUuid={projectUuid ?? ''}
                        // A build claims its app before the chart points at it,
                        // so the versions on show are that one's until it lands.
                        dataAppVizUuid={dataAppVizUuid || build.appUuid}
                        build={build}
                        elapsed={elapsed}
                        status={
                            build.isBuilding ? (
                                <DataAppVizBuildStatus
                                    build={build}
                                    elapsed={elapsed}
                                />
                            ) : undefined
                        }
                        onCancelBuild={
                            build.draft !== null && !dataAppVizUuid
                                ? build.discard
                                : build.cancel
                        }
                        footer={
                            <DataAppVizComposer
                                projectUuid={projectUuid}
                                appUuid={dataAppVizUuid || build.draftAppUuid}
                                placeholder={
                                    dataAppVizUuid
                                        ? 'Ask for a change…'
                                        : 'Describe a new visualization…'
                                }
                                isBuilding={build.isBuilding}
                                onSubmit={build.send}
                            />
                        }
                    />
                )}
            </Box>
        </MantineProvider>
    );
});
