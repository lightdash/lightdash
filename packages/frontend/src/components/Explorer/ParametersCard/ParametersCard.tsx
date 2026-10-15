import {
    getReferencedParameterDefinitions,
    getShadowedReservedNames,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
        const { t } = useTranslation('explorer');
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

        const filteredParameterDefinitions = useMemo(
            () =>
                getReferencedParameterDefinitions(
                    parameterDefinitions,
                    parameterReferences,
                ),
            [parameterDefinitions, parameterReferences],
        );

        // User params sharing a reserved name shadow it; flag them as overriding it.
        const shadowedReservedNames = useMemo(
            () =>
                getShadowedReservedNames(
                    Object.keys(filteredParameterDefinitions),
                ),
            [filteredParameterDefinitions],
        );

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
                title={t('parametersCard.title')}
                disabled={!tableName}
                toggleTooltip={!tableName ? t('parametersCard.noModel') : ''}
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
                        shadowedReservedNames={shadowedReservedNames}
                    />
                </Box>
            </CollapsableCard>
        );
    },
);

export default ParametersCard;
