import { VizLibDto } from './VizLibDto';

export class VegaDto extends VizLibDto {
    static type = 'vega' as const;

    public getType() {
        return VegaDto.type;
    }

    public getVizOptions() {
        return ['bar', 'line'];
    }

    public getConfig() {
        return {
            autosize: {
                type: 'fit',
                contains: 'padding',
                resize: true,
            },
            width: 'container',
            height: 'container',
            mark: this.getMark(),
            encoding: this.getEncoding(),
            data: { values: this.getDataSet() },
        };
    }

    private getMark() {
        return this.vizConfig?.vizType ?? 'bar';
    }

    private getEncoding() {
        return {
            x: { field: this.vizConfig?.xField, type: 'ordinal' },
            y: { field: this.vizConfig?.yFields?.[0], type: 'quantitative' },
        };
    }

    private getDataSet() {
        return this.sourceDto.getRows().map((row) => {
            return Object.fromEntries(
                Object.entries(row).map(([key, rowValue]) => [
                    key,
                    rowValue.value.raw,
                ]),
            );
        });
    }
}
