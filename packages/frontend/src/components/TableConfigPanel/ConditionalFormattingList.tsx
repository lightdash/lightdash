import { Button, FormGroup } from '@blueprintjs/core';
import {
    createConditionalFormatingRule,
    fieldId,
    getVisibleFields,
} from '@lightdash/common';
import produce from 'immer';
import { useCallback, useMemo } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ConditionalFormatting from './ConditionalFormatting';
import { ConditionalFormattingListWrapper } from './ConditionalFormatting.styles';

const ConditionalFormattingList = ({}) => {
    const {
        explore,
        tableConfig: { conditionalFormattings, onSetConditionalFormattings },
    } = useVisualizationContext();

    const activeFields = useExplorerContext((c) => c.state.activeFields);
    const visibleActiveNumericFields = useMemo(() => {
        if (!explore) return [];

        return getVisibleFields(explore)
            .filter((field) => activeFields.has(fieldId(field)))
            .filter((field) => field.type === 'number');
    }, [explore, activeFields]);

    const handleAdd = useCallback(() => {
        onSetConditionalFormattings(
            produce(conditionalFormattings, (draft) => {
                draft.push({
                    target: null,
                    color: '',
                    rules: [createConditionalFormatingRule()],
                });
            }),
        );
    }, [produce, onSetConditionalFormattings, conditionalFormattings]);

    const handleRemove = useCallback(
        (index) => {
            onSetConditionalFormattings(
                produce(conditionalFormattings, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [onSetConditionalFormattings, conditionalFormattings],
    );

    const handleOnChange = useCallback(
        (index, newConfig) => {
            onSetConditionalFormattings(
                produce(conditionalFormattings, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [onSetConditionalFormattings, conditionalFormattings],
    );

    return (
        <ConditionalFormattingListWrapper>
            {conditionalFormattings.map((conditionalFormatting, index) => (
                <ConditionalFormatting
                    key={index}
                    index={index}
                    fields={visibleActiveNumericFields}
                    value={conditionalFormatting}
                    onChange={(newConfig) => handleOnChange(index, newConfig)}
                    onRemove={() => handleRemove(index)}
                />
            ))}

            <FormGroup>
                <Button icon="plus" onClick={handleAdd}>
                    Add new rule
                </Button>
            </FormGroup>
        </ConditionalFormattingListWrapper>
    );
};

export default ConditionalFormattingList;
