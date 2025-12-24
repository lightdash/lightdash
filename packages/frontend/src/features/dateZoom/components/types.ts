import type { CompiledDimension, DateGranularity } from '@lightdash/common';

export type DateZoomInfoOnTileProps = {
    dateZoomGranularity: DateGranularity;
    dateDimension: Pick<CompiledDimension, 'label' | 'name'>;
};
