import { FeatureFlags } from '@lightdash/common';
import { Button, Menu, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import ChartTypeLibraryModal from '../../../features/chartTypes/components/ChartTypeLibraryModal';
import { getDataAppVisualization } from '../../../features/chartTypes/hooks/useDataAppVisualization';
import {
    explorerActions,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerStore,
} from '../../../features/explorer/store';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { useSelectProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import { ProvenanceGlyph } from './ChartTypeGallery';

const AddChartTypeMenu: FC = () => {
    const projectUuid = useProjectUuid();
    const dispatch = useExplorerDispatch();
    const store = useExplorerStore();
    const queryClient = useQueryClient();
    const pendingSelection = useRef<symbol | null>(null);
    useEffect(
        () => () => {
            pendingSelection.current = null;
        },
        [projectUuid],
    );
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const libraryEnabled =
        useServerFeatureFlag(FeatureFlags.ChartTypeRegistry).data?.enabled ===
        true;
    const canCreateChartType = useCanCreateDataApp(projectUuid);
    const { itemsMap } = useVisualizationContext();
    const selectProjectChartType = useSelectProjectChartType();
    const onCreateNew =
        dataAppsEnabled && canCreateChartType
            ? () =>
                  dispatch(
                      explorerActions.startChartTypeAuthoring({
                          dataAppVizUuid: null,
                      }),
                  )
            : null;
    // Browsing happens in a modal so the explore context survives the detour.
    const onFindNew =
        libraryEnabled && projectUuid !== undefined
            ? () => setIsLibraryOpen(true)
            : null;

    const addIcon = <MantineIcon icon={IconPlus} size={14} />;
    const trigger = (() => {
        if (onFindNew !== null && onCreateNew !== null) {
            return (
                <Menu position="bottom-end" closeOnItemClick>
                    <Menu.Target>
                        <Button
                            variant="subtle"
                            size="xs"
                            leftSection={addIcon}
                            rightSection={
                                <MantineIcon icon={IconChevronDown} size={12} />
                            }
                            aria-label="Add chart type"
                        >
                            Add
                        </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={
                                <ProvenanceGlyph
                                    provenance="official"
                                    size={16}
                                />
                            }
                            onClick={onFindNew}
                        >
                            <Stack gap={0}>
                                <Text fz="sm">
                                    Browse the Lightdash library
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    Ready-made chart types, installed in one
                                    click
                                </Text>
                            </Stack>
                        </Menu.Item>
                        <Menu.Item
                            leftSection={
                                <ProvenanceGlyph
                                    provenance="custom"
                                    size={16}
                                />
                            }
                            onClick={onCreateNew}
                        >
                            <Stack gap={0}>
                                <Text fz="sm">Create your own</Text>
                                <Text fz="xs" c="dimmed">
                                    Describe a chart type in Chart Studio
                                </Text>
                            </Stack>
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            );
        }
        if (onFindNew !== null) {
            return (
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={addIcon}
                    aria-label="Add chart type from the library"
                    onClick={onFindNew}
                >
                    Add
                </Button>
            );
        }
        if (onCreateNew !== null) {
            return (
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={addIcon}
                    aria-label="Add chart type in Chart Studio"
                    onClick={onCreateNew}
                >
                    Add
                </Button>
            );
        }
        return null;
    })();

    if (trigger === null) return null;

    return (
        <>
            {trigger}
            {isLibraryOpen && projectUuid !== undefined ? (
                <ChartTypeLibraryModal
                    projectUuid={projectUuid}
                    onClose={() => setIsLibraryOpen(false)}
                    // Close on install so the selection is visible at once.
                    onInstalled={(appUuid) => {
                        setIsLibraryOpen(false);
                        const selection = Symbol();
                        pendingSelection.current = selection;
                        const chart = selectUnsavedChartVersion(
                            store.getState(),
                        );
                        // The install only returns the uuid; the selection
                        // needs the schema, so fetch the type once.
                        void queryClient
                            .fetchQuery({
                                queryKey: [
                                    'data-app-viz',
                                    projectUuid,
                                    appUuid,
                                    null,
                                ],
                                queryFn: () =>
                                    getDataAppVisualization(
                                        projectUuid,
                                        appUuid,
                                        null,
                                    ),
                            })
                            .then((installed) => {
                                // A late response must not replace work done since install.
                                if (
                                    pendingSelection.current !== selection ||
                                    selectUnsavedChartVersion(
                                        store.getState(),
                                    ) !== chart
                                )
                                    return;
                                selectProjectChartType(
                                    installed,
                                    itemsMap ?? {},
                                );
                            })
                            .catch(() => undefined);
                    }}
                />
            ) : null}
        </>
    );
};

export default AddChartTypeMenu;
