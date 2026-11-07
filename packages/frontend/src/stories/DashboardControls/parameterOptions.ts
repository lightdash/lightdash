import { type ParameterValue } from '@lightdash/common';
import { type ParameterOption } from '../../features/dashboardControls/parameterOptions';

export type { ParameterOption };

/** A parameter control on the bar: one value for every parameter it sets. */
export type ParameterControl = {
    id: string;
    label: string | null;
    parameters: ParameterOption[];
    /** The tiles it sets; empty for a second control on a parameter. */
    tileUuids: string[];
    /** Its section on the bar; null for none. */
    sectionId: string | null;
    hidden?: boolean;
    value: ParameterValue | null;
};
