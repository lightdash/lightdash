import { type LineConfig } from '../../types';
import { CartiseanConfigDto } from './CartiseanConfigDto';

export class LineConfigDto extends CartiseanConfigDto<LineConfig> {
    static vizType = 'line';

    canPivot(): boolean {
        return false;
    }
}
