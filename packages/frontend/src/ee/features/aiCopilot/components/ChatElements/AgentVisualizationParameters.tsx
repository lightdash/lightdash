import { friendlyName, type ParametersValuesMap } from '@lightdash/common';
import { Badge, Flex, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './AgentVisualizationParameters.module.css';

const formatParameterValue = (value: ParametersValuesMap[string]): string =>
    Array.isArray(value) ? value.join(', ') : String(value);

// Parameter names may be model-scoped ("events.event_status") — label by the
// final segment, the same way fields drop their table prefix.
const parameterLabel = (name: string): string =>
    friendlyName(name.split('.').pop() ?? name);

type Props = {
    parameterValues: ParametersValuesMap;
};

const AgentVisualizationParameters: FC<Props> = ({ parameterValues }) => {
    const { t } = useTranslation('aiCopilotChat');
    const entries = Object.entries(parameterValues);
    if (entries.length === 0) return null;

    return (
        <Flex gap={4} wrap="wrap" align="center">
            {entries.map(([name, value]) => (
                <Badge
                    key={name}
                    variant="default"
                    fw={400}
                    className={classes.parameterBadge}
                >
                    <Text fz="xs" truncate>
                        <Text fw={600} span fz="xs">
                            {parameterLabel(name)}
                        </Text>{' '}
                        <Text span c="dimmed" fz="xs">
                            {t('parameters.is')}
                        </Text>{' '}
                        <Text fw={600} span fz="xs">
                            {formatParameterValue(value)}
                        </Text>
                    </Text>
                </Badge>
            ))}
        </Flex>
    );
};

export default AgentVisualizationParameters;
