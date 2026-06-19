import { getReservedParameterDefinitions } from '@lightdash/common';
import { Box, Code, Stack, Text } from '@mantine-8/core';
import { memo, useCallback, useMemo } from 'react';
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
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';

const ParametersCard = memo(
    ({ parameterReferences }: { parameterReferences?: string[] }) => {
        const projectUuid = useProjectUuid();

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

        const referencedReservedParameters = useMemo(() => {
            return Object.entries(getReservedParameterDefinitions()).filter(
                ([key]) => parameterReferences?.includes(key),
            );
        }, [parameterReferences]);

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

                    {referencedReservedParameters.length > 0 && (
                        <Stack gap="xs" mt="md">
                            <Text size="xs" fw={600} c="dimmed">
                                System variables
                            </Text>
                            {referencedReservedParameters.map(
                                ([name, definition]) => (
                                    <Box key={name}>
                                        <Code>{`\${ld.parameters.${name}}`}</Code>
                                        {definition.description && (
                                            <Text size="xs" c="dimmed" mt={2}>
                                                {definition.description}
                                            </Text>
                                        )}
                                    </Box>
                                ),
                            )}
                        </Stack>
                    )}
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
