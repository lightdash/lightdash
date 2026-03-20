import type { CompiledDimension, DateGranularity } from '@lightdash/common';

export type DateZoomInfoOnTileProps = {
    dateZoomGranularity: DateGranularity | string;
    dateDimension: Pick<CompiledDimension, 'label' | 'name'>;
};
