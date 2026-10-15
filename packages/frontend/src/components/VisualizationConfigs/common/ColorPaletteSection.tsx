import { isDimension } from '@lightdash/common';
import { useMemo, type ComponentProps, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

type Props = {
    size?: ComponentProps<typeof PalettePicker>['size'];
};

export const ColorPaletteSection: FC<Props> = ({ size = 'sm' }) => {
    const { t } = useTranslation('vizConfig');
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
            ? (savedChart.spaceName ?? t('common.colorPalette.orgDefault'))
            : (savedChart?.resolvedColorPalette.source.name ??
              t('common.colorPalette.orgDefault'));

    return (
        <Config>
            <Config.Section>
                <Config.Heading>
                    {t('common.colorPalette.heading')}
                </Config.Heading>
                {overrideActive && (
                    <Callout variant="info">
                        {t('common.colorPalette.overrideActive')}
                    </Callout>
                )}
                {!overrideActive && pivotDimsWithFixedColors.length > 0 && (
                    <Callout variant="info">
                        {pivotDimsWithFixedColors.length === 1
                            ? t('common.colorPalette.fixedColorsOne', {
                                  label: pivotDimsWithFixedColors[0].label,
                              })
                            : t('common.colorPalette.fixedColorsMany', {
                                  count: pivotDimsWithFixedColors.length,
                              })}{' '}
                        {t('common.colorPalette.fixedColorsKept')}
                    </Callout>
                )}
                <PalettePicker
                    size={size}
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
