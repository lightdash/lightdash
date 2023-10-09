import { Position, Toaster } from '@blueprintjs/core';
import './AppToaster.css';

/** Singleton toaster instance. Create separate instances for different options. */
export const AppToaster = Toaster.create({
    className: 'recipe-toaster',
    position: Position.BOTTOM_RIGHT,
    maxToasts: 3,
    canEscapeKeyClear: false,
});
