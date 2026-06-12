import { SchedulerFormat, type SchedulerCsvOptions } from '@lightdash/common';
import {
    Button,
    Collapse,
    Group,
    NumberInput,
    Radio,
    Stack,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconHelpCircle,
    IconSettings,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
import { Limit, Values } from './types';

type XlsxFileLayout = NonNullable<SchedulerCsvOptions['xlsxFileLayout']>;

type CsvFormattingOptionsProps = {
    format: SchedulerFormat.CSV | SchedulerFormat.XLSX;
    formatted: Values;
    onFormattedChange: (value: Values) => void;
    limit: Limit;
    onLimitChange: (value: Limit) => void;
    customLimit: number;
    onCustomLimitChange: (value: number) => void;
    exportPivotedData: boolean;
    onExportPivotedDataChange: (value: boolean) => void;
    xlsxFileLayout: XlsxFileLayout;
    onXlsxFileLayoutChange: (value: XlsxFileLayout) => void;
};

export const CsvFormattingOptions: FC<CsvFormattingOptionsProps> = ({
    format,
    formatted,
    onFormattedChange,
    limit,
    onLimitChange,
    customLimit,
    onCustomLimitChange,
    exportPivotedData,
    onExportPivotedDataChange,
    xlsxFileLayout,
    onXlsxFileLayoutChange,
}) => {
    const health = useHealth();
    const [showFormatting, setShowFormatting] = useState(false);

    return (
        <>
            <Button
                variant="subtle"
                size="compact-sm"
                style={{ alignSelf: 'start' }}
                leftSection={<MantineIcon icon={IconSettings} />}
                rightSection={
                    <MantineIcon
                        icon={showFormatting ? IconChevronUp : IconChevronDown}
                    />
                }
                onClick={() => setShowFormatting((old) => !old)}
            >
                Formatting options
            </Button>
            <Collapse in={showFormatting} pl="md">
                <Group align="start" gap="xxl">
                    {format === SchedulerFormat.XLSX && (
                        <Radio.Group
                            label={
                                <>
                                    XLSX output
                                    <Tooltip
                                        withinPortal
                                        maw={300}
                                        multiline
                                        label="Separate files puts each dashboard tile in its own XLSX file inside a ZIP. Single workbook puts each tile on its own sheet in one XLSX file."
                                        position="top"
                                    >
                                        <MantineIcon
                                            icon={IconHelpCircle}
                                            size="md"
                                            display="inline"
                                            color="gray"
                                            style={{
                                                marginLeft: '4px',
                                                marginBottom: '-4px',
                                            }}
                                        />
                                    </Tooltip>
                                </>
                            }
                            value={xlsxFileLayout}
                            onChange={(value) =>
                                onXlsxFileLayoutChange(value as XlsxFileLayout)
                            }
                        >
                            <Stack gap="xxs" pt="xs">
                                <Radio
                                    label="Separate files (ZIP)"
                                    value="zip"
                                />
                                <Radio
                                    label="Single workbook"
                                    value="workbook"
                                />
                            </Stack>
                        </Radio.Group>
                    )}
                    <Radio.Group
                        label="Values"
                        value={formatted}
                        onChange={(value) => onFormattedChange(value as Values)}
                    >
                        <Stack gap="xxs" pt="xs">
                            <Radio label="Formatted" value={Values.FORMATTED} />
                            <Radio label="Raw" value={Values.RAW} />
                        </Stack>
                    </Radio.Group>
                    <Stack gap="xs">
                        <Radio.Group
                            label="Limit"
                            value={limit}
                            onChange={(value) => onLimitChange(value as Limit)}
                        >
                            <Stack gap="xxs" pt="xs">
                                <Radio
                                    label="Results in Table"
                                    value={Limit.TABLE}
                                />
                                <Radio label="All Results" value={Limit.ALL} />
                                <Radio label="Custom..." value={Limit.CUSTOM} />
                            </Stack>
                        </Radio.Group>
                        {limit === Limit.CUSTOM && (
                            <NumberInput
                                w={150}
                                min={1}
                                required
                                value={customLimit}
                                onChange={(value) =>
                                    onCustomLimitChange(Number(value) || 1)
                                }
                            />
                        )}

                        {(limit === Limit.ALL || limit === Limit.CUSTOM) && (
                            <i>
                                Results are limited to{' '}
                                {Number(
                                    health.data?.query.csvCellsLimit || 100000,
                                ).toLocaleString()}{' '}
                                cells for each file
                            </i>
                        )}
                    </Stack>
                    <Radio.Group
                        label={
                            <>
                                Layout
                                <Tooltip
                                    withinPortal
                                    maw={300}
                                    multiline
                                    label="Applies to cartesian charts with pivoted dimensions. Grouped keeps the chart's column structure; Flat returns the raw rows from the query."
                                    position="top"
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size="md"
                                        display="inline"
                                        color="gray"
                                        style={{
                                            marginLeft: '4px',
                                            marginBottom: '-4px',
                                        }}
                                    />
                                </Tooltip>
                            </>
                        }
                        value={exportPivotedData ? 'pivoted' : 'unpivoted'}
                        onChange={(value) =>
                            onExportPivotedDataChange(value === 'pivoted')
                        }
                    >
                        <Stack gap="xxs" pt="xs">
                            <Radio label="Grouped" value="pivoted" />
                            <Radio label="Flat" value="unpivoted" />
                        </Stack>
                    </Radio.Group>
                </Group>
            </Collapse>
        </>
    );
};
