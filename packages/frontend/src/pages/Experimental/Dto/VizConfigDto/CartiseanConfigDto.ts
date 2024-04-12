import { type CartesianConfig } from '../../types';
import { VizConfigDto, type VizConfigDtoArguments } from './VizConfigDto';

export abstract class CartiseanConfigDto<
    T extends CartesianConfig = CartesianConfig,
> extends VizConfigDto<T> {
    constructor(args: VizConfigDtoArguments) {
        super(args);
        // convert to cartesian config
        const validConfig: CartesianConfig = {
            vizType: this.vizConfig.vizType,
            libType: this.vizConfig.libType,
            xField: this.vizConfig.xField,
            yFields: this.vizConfig.yFields,
            pivotFields: this.vizConfig.pivotFields,
        };
        this.vizConfig = validConfig as any;
    }

    public getXAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public getYAxisOptions() {
        return this.sourceDto.getFieldOptions();
    }

    public canPivot() {
        return true;
    }

    public getPivotOptions() {
        return this.sourceDto.getPivotOptions();
    }
}
