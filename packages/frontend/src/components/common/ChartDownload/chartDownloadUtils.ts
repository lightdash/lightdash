import {
    type PivotConfig,
    isField,
    isMetric,
    isTableCalculation,
} from '@lightdash/common';
import JsPDF from 'jspdf';
import { type VisualizationConfigTable } from '../../LightdashVisualization/types';

const FILE_NAME = 'lightdash_chart';

export enum DownloadType {
    JPEG = 'JPEG',
    PNG = 'PNG',
    SVG = 'SVG',
    PDF = 'PDF',
    JSON = 'JSON',
}

export const base64SvgToBase64Image = async (
    originalBase64: string,
    width: number,
    type: 'jpeg' | 'png' = 'png',
    isBackgroundTransparent: boolean = false,
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.onload = () => {
            document.body.appendChild(img);
            const canvas = document.createElement('canvas');
            const ratio = img.clientWidth / img.clientHeight || 1;
            document.body.removeChild(img);
            canvas.width = width;
            canvas.height = width / ratio;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (
                    type === 'jpeg' ||
                    (type === 'png' && !isBackgroundTransparent)
                ) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                try {
                    const data = canvas.toDataURL(`image/${type}`);
                    resolve(data);
                } catch (e: any) {
                    reject();
                }
            } else {
                reject();
            }
        };
        img.src = originalBase64;
    });
};

export function downloadImage(base64: string, name?: string) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = name || FILE_NAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function downloadJson(object: Object) {
    const data = JSON.stringify(object);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${FILE_NAME}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function downloadPdf(base64: string, width: number, height: number) {
    const padding: number = 20;
    let doc: JsPDF;
    if (width > height) {
        doc = new JsPDF('l', 'mm', [width + padding * 2, height + padding * 2]);
    } else {
        doc = new JsPDF('p', 'mm', [height + padding * 2, width + padding * 2]);
    }
    doc.addImage({
        imageData: base64,
        x: padding,
        y: padding,
        width,
        height,
    });
    doc.save(FILE_NAME);
}

/**
 * Creates a PivotConfig from table visualization context data.
 * This is similar to the `getPivotConfig` function in common, but works with
 * visualization config instead of saved chart version data.
 *
 * @param visualizationConfig - The table visualization configuration
 * @param pivotDimensions - Array of dimension field IDs to pivot by
 * @returns PivotConfig object for use with pivot table downloads
 */
export const createPivotConfigFromVisualization = (
    visualizationConfig: VisualizationConfigTable,
    pivotDimensions: string[],
): PivotConfig => ({
    pivotDimensions,
    metricsAsRows: visualizationConfig.chartConfig.metricsAsRows ?? false,
    hiddenMetricFieldIds:
        visualizationConfig.chartConfig.selectedItemIds?.filter(
            (fieldId: string) => {
                const field = visualizationConfig.chartConfig.getField(fieldId);
                return (
                    !visualizationConfig.chartConfig.isColumnVisible(fieldId) &&
                    field &&
                    ((isField(field) && isMetric(field)) ||
                        isTableCalculation(field))
                );
            },
        ),
    columnOrder: visualizationConfig.chartConfig.columnOrder,
    rowTotals: visualizationConfig.chartConfig.showRowCalculation ?? false,
    columnTotals:
        visualizationConfig.chartConfig.showColumnCalculation ?? false,
});
