import { assertUnreachable, capitalize } from '@lightdash/common';
import { Paper, Stack, Text } from '@mantine-8/core';
import type { Operation } from './types';

type ReplaceOperationProps = {
    value: string;
    name: string;
};

const ReplaceOperation = ({ value, name }: ReplaceOperationProps) => {
    return (
        <Paper bg="gray.0" p="xs" component={Stack} gap="xxs">
            <Text component="code" size="xs" fw={600} c="gray.7">
                {capitalize(name)}
            </Text>
            <Text size="sm">"{value}"</Text>
        </Paper>
    );
};

type OperationRendererProps = {
    operation: Operation;
    property: string;
};

export const OperationRenderer = ({
    operation,
    property,
}: OperationRendererProps) => {
    switch (operation.op) {
        case 'replace':
            return <ReplaceOperation value={operation.value} name={property} />;
        default:
            return assertUnreachable(operation.op, 'Unknown operation type');
    }
};
