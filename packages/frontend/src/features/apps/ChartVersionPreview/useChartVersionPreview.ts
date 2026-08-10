import { useContext } from 'react';
import { ChartVersionPreviewContext } from './context';

export const useChartVersionPreview = (): string | undefined =>
    useContext(ChartVersionPreviewContext);
