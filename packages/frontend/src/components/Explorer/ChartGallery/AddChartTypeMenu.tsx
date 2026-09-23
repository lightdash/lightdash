import { FeatureFlags } from '@lightdash/common';
import { Button, Menu, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import ChartTypeLibraryModal from '../../../features/chartTypes/components/ChartTypeLibraryModal';
import { useDataAppVisualizations } from '../../../features/chartTypes/hooks/useDataAppVisualizations';
import {
    explorerActions,
    useExplorerDispatch,
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
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [pendingInstalledUuid, setPendingInstalledUuid] = useState<
        string | null
    >(null);
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const libraryEnabled =
        useServerFeatureFlag(FeatureFlags.ChartTypeRegistry).data?.enabled ===
        true;
    const canCreateChartType = useCanCreateDataApp(projectUuid);
    const { itemsMap } = useVisualizationContext();
    const selectProjectChartType = useSelectProjectChartType();
    // Shares the gallery's unsearched list, which an install invalidates.
    const { data } = useDataAppVisualizations(
        libraryEnabled ? projectUuid : undefined,
        '',
    );
    const projectTypes = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data?.pages],
    );

    // A library install should land selected: the install invalidates the
    // list, and this picks the new type up from the refetch exactly once.
    useEffect(() => {
        if (pendingInstalledUuid === null) return;
        const installed = projectTypes.find(
            (viz) => viz.dataAppVizUuid === pendingInstalledUuid,
        );
        if (installed === undefined) return;
        setPendingInstalledUuid(null);
        selectProjectChartType(installed, itemsMap ?? {});
    }, [pendingInstalledUuid, projectTypes, selectProjectChartType, itemsMap]);

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
                        setPendingInstalledUuid(appUuid);
                        setIsLibraryOpen(false);
                    }}
                />
            ) : null}
        </>
    );
};

export default AddChartTypeMenu;
