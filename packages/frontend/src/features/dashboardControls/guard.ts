import { getControlTypeForParameter, type ControlType } from './controlType';
import { type ParameterType } from './parameterMapping';

// What happens when something else in the bar is pressed: nothing is open,
// the open control gives way, or it stays and says why
export type GuardDecision = 'none' | 'replace' | 'hold';

export const getGuardDecision = ({
    hasOpenControl,
    hasChanges,
}: {
    hasOpenControl: boolean;
    hasChanges: boolean;
}): GuardDecision => {
    if (!hasOpenControl) return 'none';
    return hasChanges ? 'hold' : 'replace';
};

// Escape or a press outside: a new control nobody answered or changed goes
// away; any other shrinks to its footer line and keeps its draft
export const getDismissAction = ({
    isChoosing,
    hasChanges,
}: {
    isChoosing: boolean;
    hasChanges: boolean;
}): 'cancel' | 'shrink' => (isChoosing && !hasChanges ? 'cancel' : 'shrink');

// Whether a control goes back to its first step: a new one, answered, that
// lost its last field or parameter or applies to no tile any more. It was
// never applied, so it can still be either kind. An existing control stays
// on its tabs instead.
export const getShouldRestartNewControl = ({
    isNew,
    isAnswered,
    isLoading,
    isMapped,
    mappedCount,
}: {
    isNew: boolean;
    isAnswered: boolean;
    // Counts are not known yet
    isLoading: boolean;
    isMapped: boolean;
    mappedCount: number;
}): boolean =>
    isNew && isAnswered && !isLoading && (!isMapped || mappedCount === 0);

// Why "Apply" is off, most basic reason first; null when it can be pressed
export type ApplyBlock = 'loading' | 'noTiles' | 'noValue';

export const getApplyBlock = ({
    isLoading,
    isMapped,
    mappedCount,
    hasValue,
}: {
    isLoading: boolean;
    // The control has a field or a parameter to apply through
    isMapped: boolean;
    // Tiles the draft applies to
    mappedCount: number;
    hasValue: boolean;
}): ApplyBlock | null => {
    if (isLoading) return 'loading';
    if (!isMapped || mappedCount === 0) return 'noTiles';
    return hasValue ? null : 'noValue';
};

// The types "Add control" offers: the ones the dashboard has a field or a
// parameter of. Null while either is unknown: every type stays on offer.
export const getAvailableControlTypes = ({
    fieldTypes,
    parameterTypes,
}: {
    // One per field, by the control type it belongs to
    fieldTypes: ControlType[] | null;
    parameterTypes: ParameterType[] | null;
}): Set<ControlType> | null =>
    fieldTypes === null || parameterTypes === null
        ? null
        : new Set([
              ...fieldTypes,
              ...parameterTypes.map(getControlTypeForParameter),
          ]);
