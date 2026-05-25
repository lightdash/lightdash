import { isDimension } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    selectSavedChart,
    selectUnsavedColorPaletteUuid,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { explorerActions } from '../../../features/explorer/store/explorerSlice';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import Callout from '../../common/Callout';
import { PalettePicker } from '../../common/PalettePicker/PalettePicker';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from './Config';

export const ColorPaletteSection: FC = () => {
    const dispatch = useExplorerDispatch();
    const savedChart = useExplorerSelector(selectSavedChart);
    const value = useExplorerSelector(selectUnsavedColorPaletteUuid);
    const { data: palettes = [] } = useColorPalettes();
    const { data: health } = useHealth();
    const { pivotDimensions, itemsMap } = useVisualizationContext();

    const overrideActive =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    const pivotDimsWithFixedColors = useMemo(() => {
        if (!pivotDimensions?.length || !itemsMap) return [];
        return pivotDimensions.flatMap((fieldId) => {
            const item = itemsMap[fieldId];
            if (
                item &&
                isDimension(item) &&
                item.colors &&
                Object.keys(item.colors).length > 0
            ) {
                return [item];
            }
            return [];
        });
    }, [pivotDimensions, itemsMap]);

    const inheritedSourceName =
        savedChart?.resolvedColorPalette.source.type === 'chart' ||
        savedChart?.resolvedColorPalette.source.type === 'config' ||
        savedChart?.resolvedColorPalette.source.type === 'default'
            ? (savedChart.spaceName ?? 'Org default')
            : (savedChart?.resolvedColorPalette.source.name ?? 'Org default');

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Color palette</Config.Heading>
                {overrideActive && (
                    <Callout variant="info">
                        A color palette override is set in your instance
                        configuration. Chart-level selection is disabled while
                        the override is active.
                    </Callout>
                )}
                {!overrideActive && pivotDimsWithFixedColors.length > 0 && (
                    <Callout variant="info">
                        {pivotDimsWithFixedColors.length === 1
                            ? `"${pivotDimsWithFixedColors[0].label}" has fixed colors defined in the data model.`
                            : `${pivotDimsWithFixedColors.length} pivoted dimensions have fixed colors defined in the data model.`}{' '}
                        Those values will keep their assigned colors regardless
                        of the palette selected here.
                    </Callout>
                )}
                <PalettePicker
                    size="sm"
                    value={value}
                    onChange={(next) =>
                        dispatch(explorerActions.setColorPaletteUuid(next))
                    }
                    palettes={palettes}
                    parentLabel={inheritedSourceName}
                    disabled={overrideActive}
                    showPreview={false}
                />
            </Config.Section>
        </Config>
    );
};
