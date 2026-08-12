import { friendlyName, type ParametersValuesMap } from '@lightdash/common';
import { Button, Flex, Text } from '@mantine/core';
import { type FC } from 'react';
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
    const entries = Object.entries(parameterValues);
    if (entries.length === 0) return null;

    return (
        <Flex gap={4} wrap="wrap" align="center">
            {entries.map(([name, value]) => (
                <Button
                    key={name}
                    size="xs"
                    variant="default"
                    className={classes.parameterButton}
                    classNames={{ label: classes.parameterButtonLabel }}
                >
                    <Text fz="xs" truncate>
                        <Text fw={600} span fz="xs">
                            {parameterLabel(name)}
                        </Text>{' '}
                        <Text span c="dimmed" fz="xs">
                            is
                        </Text>{' '}
                        <Text fw={700} span fz="xs">
                            {formatParameterValue(value)}
                        </Text>
                    </Text>
                </Button>
            ))}
        </Flex>
    );
};

export default AgentVisualizationParameters;
