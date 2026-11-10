import { ChartKind, type ComposerVizKind } from '@lightdash/common';
import { getChartIcon } from '../../../../../../components/common/ResourceIcon/utils';

const CHART_KIND: Record<ComposerVizKind, ChartKind> = {
    table: ChartKind.TABLE,
    bar: ChartKind.VERTICAL_BAR,
    line: ChartKind.LINE,
    pie: ChartKind.PIE,
    big_number: ChartKind.BIG_NUMBER,
};

export const getComposerVizKindIcon = (kind: ComposerVizKind) =>
    getChartIcon(CHART_KIND[kind]);
