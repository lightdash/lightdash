import { CartiseanConfigDto } from './CartiseanConfigDto';

export class LineConfigDto extends CartiseanConfigDto {
    static vizType = 'line';

    canPivot(): boolean {
        return false;
    }
}
