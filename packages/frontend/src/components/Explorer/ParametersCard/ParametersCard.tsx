import { Box } from '@mantine-8/core';
import { memo, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    selectIsEditMode,
    selectIsParametersExpanded,
    selectParameterDefinitions,
    selectParameters,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { ParameterSelection } from '../../../features/parameters';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({ parameterReferences }: { parameterReferences?: string[] }) => {
        const { projectUuid } = useParams<{ projectUuid: string }>();

        const paramsIsOpen = useExplorerSelector(selectIsParametersExpanded);
        const isEditMode = useExplorerSelector(selectIsEditMode);
        const tableName = useExplorerSelector(selectTableName);
        const parameterDefinitions = useExplorerSelector(
            selectParameterDefinitions,
        );
        const parameterValues = useExplorerSelector(selectParameters);
        const dispatch = useExplorerDispatch();

        const { missingRequiredParameters } = useExplorerQuery();

        const toggleExpandedSection = useCallback(
            (section: ExplorerSection) => {
                dispatch(explorerActions.toggleExpandedSection(section));
            },
            [dispatch],
        );

        const filteredParameterDefinitions = useMemo(() => {
            return Object.fromEntries(
                Object.entries(parameterDefinitions).filter(([key]) =>
                    parameterReferences?.includes(key),
                ),
            );
        }, [parameterDefinitions, parameterReferences]);

        const setParameter = useCallback(
            (
                key: string,
                value: string | number | string[] | number[] | null,
            ) => {
                dispatch(explorerActions.setParameter({ key, value }));
            },
            [dispatch],
        );

        const clearAllParameters = useCallback(() => {
            dispatch(explorerActions.clearAllParameters());
        }, [dispatch]);

        const handleParameterChange = (
            paramKey: string,
            value: string | number | string[] | number[] | null,
        ) => {
            setParameter(paramKey, value);
        };

        return (
            <CollapsableCard
                isOpen={paramsIsOpen}
                title="Parameters"
                disabled={!tableName}
                toggleTooltip={!tableName ? 'No model selected' : ''}
                onToggle={() =>
                    toggleExpandedSection(ExplorerSection.PARAMETERS)
                }
            >
                <Box m="md">
                    <ParameterSelection
                        parameters={filteredParameterDefinitions}
                        missingRequiredParameters={missingRequiredParameters}
                        parameterValues={parameterValues || {}}
                        onParameterChange={handleParameterChange}
                        showClearAll={true}
                        onClearAll={clearAllParameters}
                        cols={2}
                        projectUuid={projectUuid}
                        disabled={!isEditMode}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
