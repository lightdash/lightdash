import { type BarConfig } from '../../types';
import { CartiseanConfigDto } from './CartiseanConfigDto';

export class BarConfigDto extends CartiseanConfigDto<BarConfig> {
    static vizType = 'bar';

    // Nothing to override
}
