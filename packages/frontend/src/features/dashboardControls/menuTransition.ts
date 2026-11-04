import { dropdownTransition } from '../../theme/components';

// The theme's dropdown pop for the "Add a field" and "..." menus, closing at once
export const MENU_TRANSITION = { ...dropdownTransition, exitDuration: 0 };
