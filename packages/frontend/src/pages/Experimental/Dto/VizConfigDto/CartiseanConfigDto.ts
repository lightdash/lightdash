import { type CartesianConfig } from '../../types';
import { VizConfigDto } from './VizConfigDto';

export abstract class CartiseanConfigDto<
    T extends CartesianConfig = CartesianConfig,
> extends VizConfigDto<T> {
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
