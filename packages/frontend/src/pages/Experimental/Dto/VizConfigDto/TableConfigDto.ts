import { type TableConfig } from '../../types';
import { VizConfigDto, type VizConfigDtoArguments } from './VizConfigDto';

export class TableConfigDto extends VizConfigDto<TableConfig> {
    static vizType = 'table' as const;

    constructor(args: VizConfigDtoArguments) {
        super(args);
        this.vizConfig.columns = this.getColumns();
    }

    private getColumns(): Array<string> {
        return this.sourceDto.getFieldOptions();
    }
}
