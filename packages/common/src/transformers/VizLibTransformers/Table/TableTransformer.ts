import {
    type TableConfig,
    type TableConfigTransformer,
} from '../../VizConfigTransformers';
import { AbstractVizLibTransformer } from '../AbstractVizLibTransformer';

export class TableTransformer extends AbstractVizLibTransformer<TableConfigTransformer> {
    static type = 'table' as const;

    static supportedVizTypes = ['table'];

    // eslint-disable-next-line class-methods-use-this
    public getType() {
        return TableTransformer.type;
    }

    public getConfig() {
        return {
            rows: this.getRows(),
            columns: this.getColumns(),
        };
    }

    private getColumns(): TableConfig['columns'] {
        return this.vizConfigTransformer.getVizConfig().columns;
    }

    private getRows() {
        return this.vizConfigTransformer.getRows();
    }
}
