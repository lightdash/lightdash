import { type AbstractCartesianConfigTransformer } from '../../VizConfigTransformers';
import { AbstractVizLibTransformer } from '../AbstractVizLibTransformer';

export class VegaTransformer extends AbstractVizLibTransformer<AbstractCartesianConfigTransformer> {
    static type = 'vega' as const;

    static supportedVizTypes = ['bar'];

    // eslint-disable-next-line class-methods-use-this
    public getType() {
        return VegaTransformer.type;
    }

    public getConfig() {
        return {
            ...this.getLayoutProps(),
            mark: this.getMark(),
            encoding: this.getEncoding(),
            data: { values: this.getDataSet() },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private getLayoutProps() {
        return {
            autosize: {
                type: 'fit',
                contains: 'padding',
                resize: true,
            },
            width: 'container',
            height: 'container',
        };
    }

    private getMark() {
        return {
            type: this.vizConfigTransformer.getVizConfig().type,
            color: '#7162ff',
        };
    }

    private getEncoding() {
        const vizConfig = this.vizConfigTransformer.getVizConfig();

        return {
            x: {
                field: vizConfig.xAxis.fieldId,
                title: vizConfig.xAxis.label,
                type: 'nominal', // TODO
                axis: { labelAngle: 0 },
            },
            y: {
                field: vizConfig.yAxis?.[0].fieldId,
                title: vizConfig.yAxis?.[0].label,
                type: 'quantitative', // TODO
            },
        };
    }

    private getDataSet() {
        return this.vizConfigTransformer
            .getRows()
            .map((row) =>
                Object.fromEntries(
                    Object.entries(row).map(([key, rowValue]) => [
                        key,
                        rowValue.value.raw,
                    ]),
                ),
            );
    }
}
