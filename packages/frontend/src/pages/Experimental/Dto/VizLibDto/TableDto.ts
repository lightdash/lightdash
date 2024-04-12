import { getResultValueArray } from '@lightdash/common';
import { type TableConfig } from '../../types';
import { VizLibDto } from './VizLibDto';

export class TableDto extends VizLibDto<TableConfig> {
    static type = 'table' as const;

    static supportedVizTypes = ['table'];

    public getType() {
        return TableDto.type;
    }

    public getConfig() {
        return {
            rows: this.getRows(),
            columns: this.getColumns(),
        };
    }

    private getColumns(): Array<string> {
        return this.vizConfig?.columns || [];
    }

    private getRows() {
        return getResultValueArray(this.sourceDto.getRows(), true);
    }
}
