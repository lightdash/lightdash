import { type RoleLevel } from '@lightdash/common';

export type RoleFormValues = {
    name: string;
    description: string;
    level: RoleLevel;
    scopes: Record<string, boolean>;
};
