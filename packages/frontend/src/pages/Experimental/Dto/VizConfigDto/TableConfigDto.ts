import { type TableConfig } from '../../types';
import { VizConfigDto, type VizConfigDtoArguments } from './VizConfigDto';

export class TableConfigDto extends VizConfigDto<TableConfig> {
    static vizType = 'table' as const;

    constructor(args: VizConfigDtoArguments) {
        super(args);
        // convert to table config
        const validTableConfig: TableConfig = {
            vizType: this.vizConfig.vizType,
            libType: this.vizConfig.libType,
            columns: this.getColumns(),
        };
        this.vizConfig = validTableConfig;
    }

    private getColumns(): Array<string> {
        return this.sourceDto.getFieldOptions();
    }
}
