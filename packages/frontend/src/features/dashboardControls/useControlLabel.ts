import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type ControlModel } from './context';
import { isControlMapped, type ControlDraft } from './controlDraft';
import { getControlTypeWord } from './controlType';
import { getControlLabel } from './parameterMapping';

// The open control as its pill names it. A new one takes the name of what
// it filters by as soon as that is chosen.
export const useControlLabel = ({
    draft,
    model,
}: {
    draft: ControlDraft;
    model: ControlModel;
}): string => {
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    if (draft.isNew && !isControlMapped(draft)) {
        return `New ${getControlTypeWord(draft.controlType)} control`;
    }
    if (draft.kind === 'parameter') {
        return getControlLabel(draft.control, definitions);
    }
    const { fieldId } = draft.rule.target;
    return (
        draft.rule.label ||
        model.field?.label ||
        model.items[fieldId]?.label ||
        fieldId
    );
};
