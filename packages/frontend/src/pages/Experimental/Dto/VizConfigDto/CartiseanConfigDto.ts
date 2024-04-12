import { VizConfigDto } from './VizConfigDto';

export abstract class CartiseanConfigDto extends VizConfigDto {
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
