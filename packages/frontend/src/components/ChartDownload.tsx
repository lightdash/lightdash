import { subject } from '@casl/ability';
import {
    assertUnreachable,
    getCustomLabelsFromColumnProperties,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Popover,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { IconDownload, IconShare2 } from '@tabler/icons-react';
import { type EChartsInstance } from 'echarts-for-react';
import JsPDF from 'jspdf';
import React, { memo, useCallback, useState } from 'react';
import useEchartsCartesianConfig from '../hooks/echarts/useEchartsCartesianConfig';
import { useApp } from '../providers/AppProvider';
import { Can } from './common/Authorization';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from './common/CollapsableCard';
import MantineIcon from './common/MantineIcon';
import ExportSelector from './ExportSelector';
import { isBigNumberVisualizationConfig } from './LightdashVisualization/VisualizationBigNumberConfig';
import { isCartesianVisualizationConfig } from './LightdashVisualization/VisualizationConfigCartesian';
import { isTableVisualizationConfig } from './LightdashVisualization/VisualizationConfigTable';
import { isCustomVisualizationConfig } from './LightdashVisualization/VisualizationCustomConfig';
import { useVisualizationContext } from './LightdashVisualization/VisualizationProvider';

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

function downloadJson(object: Object) {
    const data = JSON.stringify(object);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${FILE_NAME}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadPdf(base64: string, width: number, height: number) {
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

type DownloadOptions = {
    getChartInstance: () => EChartsInstance | undefined;
    unavailableOptions?: DownloadType[];
};
export const ChartDownloadOptions: React.FC<DownloadOptions> = ({
    getChartInstance,
    unavailableOptions,
}) => {
    const [type, setType] = useState<DownloadType>(DownloadType.PNG);
    const [isBackgroundTransparent, setIsBackgroundTransparent] =
        useState(false);

    const onDownload = useCallback(async () => {
        const chartInstance = getChartInstance();
        if (!chartInstance) {
            console.error('Chart instance is not available');
            return;
        }

        try {
            const svgBase64 = chartInstance.getDataURL();
            const width = chartInstance.getWidth();
            const height = chartInstance.getHeight();

            switch (type) {
                case DownloadType.PDF:
                    downloadPdf(
                        await base64SvgToBase64Image(svgBase64, width),
                        width,
                        height,
                    );
                    break;
                case DownloadType.SVG:
                    downloadImage(svgBase64);
                    break;
                case DownloadType.JPEG:
                    downloadImage(
                        await base64SvgToBase64Image(svgBase64, width, 'jpeg'),
                    );
                    break;
                case DownloadType.PNG:
                    downloadImage(
                        await base64SvgToBase64Image(
                            svgBase64,
                            width,
                            'png',
                            isBackgroundTransparent,
                        ),
                    );
                    break;
                case DownloadType.JSON:
                    downloadJson(chartInstance.getOption());
                    break;
                default: {
                    assertUnreachable(
                        type,
                        `Unexpected download type: ${type}`,
                    );
                }
            }
        } catch (e) {
            console.error(`Unable to download ${type} from chart ${e}`);
        }
    }, [getChartInstance, type, isBackgroundTransparent]);

    return (
        <Stack>
            <Text fw={500}>Options</Text>
            <Select
                size="xs"
                id="download-type"
                value={type}
                onChange={(value) => setType(value as DownloadType)}
                data={Object.values(DownloadType)
                    .filter(
                        (downloadType) =>
                            !unavailableOptions?.includes(downloadType),
                    )
                    .map((downloadType) => ({
                        value: downloadType,
                        label: downloadType,
                    }))}
            />
            {type === DownloadType.PNG && (
                <SegmentedControl
                    size="xs"
                    id="background-transparency"
                    value={isBackgroundTransparent ? 'Transparent' : 'Opaque'}
                    onChange={(value) =>
                        setIsBackgroundTransparent(value === 'Transparent')
                    }
                    data={[
                        { value: 'Opaque', label: 'Opaque' },
                        { value: 'Transparent', label: 'Transparent' },
                    ]}
                />
            )}
            <Button
                size="xs"
                ml="auto"
                leftIcon={<MantineIcon icon={IconDownload} />}
                onClick={onDownload}
            >
                Download
            </Button>
        </Stack>
    );
};

interface ChartDownloadMenuProps {
    projectUuid: string;
    getCsvLink?: (
        limit: number | null,
        onlyRaw: boolean,
        showTableNames: boolean,
        columnOrder: string[],
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
    getGsheetLink?: (
        columnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
    ) => Promise<ApiScheduledDownloadCsv>;
}

export const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getCsvLink, getGsheetLink, projectUuid }) => {
        const { chartRef, visualizationConfig, resultsData } =
            useVisualizationContext();

        const eChartsOptions = useEchartsCartesianConfig();

        const disabled =
            (isTableVisualizationConfig(visualizationConfig) &&
                resultsData?.rows &&
                resultsData.rows.length <= 0) ||
            !resultsData?.metricQuery ||
            isBigNumberVisualizationConfig(visualizationConfig) ||
            (isCartesianVisualizationConfig(visualizationConfig) &&
                !eChartsOptions) ||
            isCustomVisualizationConfig(visualizationConfig);

        const { user } = useApp();

        const getChartInstance = useCallback(
            () => chartRef.current?.getEchartsInstance(),
            [chartRef],
        );

        return isTableVisualizationConfig(visualizationConfig) && getCsvLink ? (
            <Can
                I="manage"
                this={subject('ExportCsv', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Popover
                    {...COLLAPSABLE_CARD_POPOVER_PROPS}
                    disabled={disabled}
                    position="bottom-end"
                >
                    <Popover.Target>
                        <ActionIcon
                            data-testid="export-csv-button"
                            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconShare2} color="gray" />
                        </ActionIcon>
                    </Popover.Target>

                    <Popover.Dropdown>
                        <ExportSelector
                            projectUuid={projectUuid}
                            rows={resultsData?.rows}
                            getCsvLink={async (
                                limit: number | null,
                                onlyRaw: boolean,
                            ) =>
                                getCsvLink(
                                    limit,
                                    onlyRaw,
                                    visualizationConfig.chartConfig
                                        .showTableNames,
                                    visualizationConfig.chartConfig.columnOrder,
                                    getCustomLabelsFromColumnProperties(
                                        visualizationConfig.chartConfig
                                            .columnProperties,
                                    ),
                                )
                            }
                            getGsheetLink={
                                getGsheetLink === undefined
                                    ? undefined
                                    : () =>
                                          getGsheetLink(
                                              visualizationConfig.chartConfig
                                                  .columnOrder,
                                              visualizationConfig.chartConfig
                                                  .showTableNames,
                                              getCustomLabelsFromColumnProperties(
                                                  visualizationConfig
                                                      .chartConfig
                                                      .columnProperties,
                                              ),
                                          )
                            }
                        />
                    </Popover.Dropdown>
                </Popover>
            </Can>
        ) : isTableVisualizationConfig(visualizationConfig) &&
          !getCsvLink ? null : (
            <Popover
                {...COLLAPSABLE_CARD_POPOVER_PROPS}
                disabled={disabled}
                position="bottom-end"
            >
                <Popover.Target>
                    <ActionIcon
                        data-testid="export-csv-button"
                        {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconShare2} color="gray" />
                    </ActionIcon>
                </Popover.Target>

                <Popover.Dropdown>
                    {visualizationConfig?.chartType &&
                    !isTableVisualizationConfig(visualizationConfig) &&
                    chartRef.current ? (
                        <ChartDownloadOptions
                            getChartInstance={getChartInstance}
                        />
                    ) : null}
                </Popover.Dropdown>
            </Popover>
        );
    },
);
