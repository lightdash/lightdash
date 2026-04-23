import {
    type ApiError,
    type GeneratedFormulaTableCalculation,
} from '@lightdash/common';
import { Box, Button, Group, Loader, Text } from '@mantine-8/core';
import { IconWand } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './FormulaConversionPreview.module.css';

type Props = {
    isLoading: boolean;
    error: ApiError | null;
    result: GeneratedFormulaTableCalculation | null;
    onApply: () => void;
    onDiscard: () => void;
    onRetry: () => void;
};

const FormulaConversionPreview: FC<Props> = ({
    isLoading,
    error,
    result,
    onApply,
    onDiscard,
    onRetry,
}) => {
    if (isLoading) {
        return (
            <Box className={classes.container}>
                <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">
                        Converting your SQL to a formula…
                    </Text>
                </Group>
            </Box>
        );
    }

    if (error) {
        return (
            <Box className={classes.container}>
                <Callout variant="danger" title="Couldn't convert to formula">
                    <Text size="sm">
                        {error.error?.message ??
                            'Something went wrong. Try again or write the formula yourself.'}
                    </Text>
                    <Group justify="flex-end" mt="xs">
                        <Button variant="subtle" size="xs" onClick={onDiscard}>
                            Dismiss
                        </Button>
                        <Button size="xs" onClick={onRetry}>
                            Try again
                        </Button>
                    </Group>
                </Callout>
            </Box>
        );
    }

    if (!result) return null;

    return (
        <Box className={classes.container}>
            <Box className={classes.header}>
                <Box className={classes.title}>
                    <MantineIcon icon={IconWand} color="indigo" />
                    <Text size="sm" fw={600}>
                        Suggested formula
                    </Text>
                </Box>
            </Box>
            <Box className={classes.formulaBox}>
                <span className={classes.equalsPrefix}>=</span>
                {result.formula}
            </Box>
            <Box className={classes.actions}>
                <Button variant="subtle" size="xs" onClick={onDiscard}>
                    Discard
                </Button>
                <Button size="xs" color="indigo" onClick={onApply}>
                    Apply
                </Button>
            </Box>
        </Box>
    );
};

export default FormulaConversionPreview;
