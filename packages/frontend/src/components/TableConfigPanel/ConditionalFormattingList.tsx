import { Button, Classes, FormGroup } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import {
    createConditionalFormattingConfig,
    fieldId,
    getVisibleFields,
    isNumericItem,
} from '@lightdash/common';
import produce from 'immer';
import { useCallback, useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import ConditionalFormatting from './ConditionalFormatting';
import { ConditionalFormattingListWrapper } from './ConditionalFormatting.styles';

const ConditionalFormattingList = ({}) => {
    const [isAddingNew, setIsAddingNew] = useState(false);
    const {
        explore,
        tableConfig: { conditionalFormattings, onSetConditionalFormattings },
    } = useVisualizationContext();

    const activeFields = useExplorerContext((c) => c.state.activeFields);

    const visibleActiveNumericFields = useMemo(() => {
        if (!explore) return [];

        return getVisibleFields(explore)
            .filter((field) => activeFields.has(fieldId(field)))
            .filter((field) => isNumericItem(field));
    }, [explore, activeFields]);

    const activeConfigs = useMemo(() => {
        return conditionalFormattings.filter((config) =>
            config.target
                ? visibleActiveNumericFields.find(
                      (field) => fieldId(field) === config.target?.fieldId,
                  )
                : true,
        );
    }, [conditionalFormattings, visibleActiveNumericFields]);

    const handleAdd = useCallback(() => {
        setIsAddingNew(true);
        onSetConditionalFormattings(
            produce(activeConfigs, (draft) => {
                draft.push(createConditionalFormattingConfig());
            }),
        );
    }, [onSetConditionalFormattings, activeConfigs]);

    const handleRemove = useCallback(
        (index) =>
            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            ),
        [onSetConditionalFormattings, activeConfigs],
    );

    const handleChange = useCallback(
        (index, newConfig) =>
            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            ),
        [onSetConditionalFormattings, activeConfigs],
    );

    return (
        <ConditionalFormattingListWrapper>
            {activeConfigs.map((conditionalFormatting, index) => (
                <ConditionalFormatting
                    key={index}
                    isDefaultOpen={activeConfigs.length === 1 || isAddingNew}
                    index={index}
                    fields={visibleActiveNumericFields}
                    value={conditionalFormatting}
                    onChange={(newConfig) => handleChange(index, newConfig)}
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
