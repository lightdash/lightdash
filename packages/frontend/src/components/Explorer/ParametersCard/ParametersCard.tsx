import {
    getReservedParameterDefinitions,
    getShadowedReservedNames,
} from '@lightdash/common';
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

        // A user parameter sharing a reserved name takes priority (shadows it), so the
        // reserved one is hidden from System variables and flagged as overridden instead.
        const shadowedReservedNames = useMemo(
            () =>
                getShadowedReservedNames(
                    Object.keys(filteredParameterDefinitions),
                ),
            [filteredParameterDefinitions],
        );

        const referencedReservedParameters = useMemo(() => {
            return Object.entries(getReservedParameterDefinitions()).filter(
                ([key]) =>
                    parameterReferences?.includes(key) &&
                    !shadowedReservedNames.includes(key),
            );
        }, [parameterReferences, shadowedReservedNames]);

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

                    {shadowedReservedNames.length > 0 && (
                        <Text size="xs" c="yellow.7" mt="md">
                            {shadowedReservedNames.length > 1
                                ? `Parameters ${shadowedReservedNames.join(
                                      ', ',
                                  )} override system variables of the same name and take priority over them.`
                                : `Parameter ${shadowedReservedNames[0]} overrides the system variable of the same name and takes priority over it.`}
                        </Text>
                    )}

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
