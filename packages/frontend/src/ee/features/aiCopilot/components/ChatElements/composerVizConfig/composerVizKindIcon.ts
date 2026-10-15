import { ChartKind, type ComposerVizKind } from '@lightdash/common';
import { IconPuzzle } from '@tabler/icons-react';
import { getChartIcon } from '../../../../../../components/common/ResourceIcon/utils';

const CHART_KIND: Record<Exclude<ComposerVizKind, 'custom'>, ChartKind> = {
    table: ChartKind.TABLE,
    bar: ChartKind.VERTICAL_BAR,
    line: ChartKind.LINE,
    pie: ChartKind.PIE,
    big_number: ChartKind.BIG_NUMBER,
};

export const getComposerVizKindIcon = (kind: ComposerVizKind) =>
    kind === 'custom' ? IconPuzzle : getChartIcon(CHART_KIND[kind]);
