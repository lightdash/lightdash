import { Position, Toaster } from '@blueprintjs/core';
import './RefreshToaster.css';

/** Singleton toaster instance. Create separate instances for different options. */
export const RefreshToaster = Toaster.create({
    className: 'recipe-toaster',
    position: Position.BOTTOM_RIGHT,
    maxToasts: 1,
    canEscapeKeyClear: false,
});
