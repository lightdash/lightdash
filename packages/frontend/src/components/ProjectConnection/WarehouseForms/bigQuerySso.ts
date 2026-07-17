import { type BigqueryDataset } from '@lightdash/common';

export const largestDatasetName = (
    datasets: BigqueryDataset[],
): string | null => {
    let largestName: string | null = null;
    let largestSize = 0;
    datasets.forEach((dataset) => {
        const size = dataset.sizeBytes ?? 0;
        if (size > largestSize) {
            largestName = dataset.datasetId;
            largestSize = size;
        }
    });
    return largestName;
};
