import { Anchor, Group, Stack, Text } from '@mantine-8/core';
import {
    IconArrowUpRight,
    IconMathFunction,
    IconSparkles,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './FormulaEmptyState.module.css';

type Props = {
    aiEnabled: boolean;
    onInsertExample: (text: string) => void;
};

const EXAMPLES = [
    '=ROUND(@field, 2)',
    '=SUM(@a) - SUM(@b)',
    '=IF(@status = "won", 1, 0)',
];

export const FormulaEmptyState: FC<Props> = ({
    aiEnabled,
    onInsertExample,
}) => {
    return (
        <Stack gap={8} className={classes.root}>
            <Group gap="xs" wrap="nowrap" className={classes.heading}>
                <MantineIcon
                    icon={IconMathFunction}
                    size="sm"
                    color="indigo.4"
                />
                <Text size="xs" fw={500} inherit>
                    Excel/Sheets-style formulas
                </Text>
            </Group>

            <Group gap="md" wrap="wrap" className={classes.affordances}>
                <Group gap={6} wrap="nowrap">
                    <kbd className={classes.kbd}>@</kbd>
                    <Text size="xs" inherit>
                        reference a field
                    </Text>
                </Group>
                <Group gap={6} wrap="nowrap">
                    <kbd className={classes.kbd}>#</kbd>
                    <Text size="xs" inherit>
                        call a function
                    </Text>
                </Group>
                {aiEnabled && (
                    <Group gap={4} wrap="nowrap">
                        <MantineIcon
                            icon={IconSparkles}
                            size="xs"
                            color="indigo.4"
                        />
                        <Text size="xs" inherit>
                            or describe it
                        </Text>
                    </Group>
                )}
            </Group>

            <Group gap={6} wrap="wrap">
                {EXAMPLES.map((example) => (
                    <button
                        key={example}
                        type="button"
                        onClick={() => onInsertExample(example)}
                        className={classes.exampleChip}
                        aria-label={`Insert example formula ${example}`}
                    >
                        {example}
                    </button>
                ))}
                <Anchor
                    href="https://docs.lightdash.com/guides/formula-table-calculations"
                    target="_blank"
                    rel="noreferrer"
                    size="xs"
                    underline="hover"
                    className={classes.docsLink}
                    ml="auto"
                >
                    <Group gap={2} wrap="nowrap">
                        Formula docs
                        <MantineIcon icon={IconArrowUpRight} size="xs" />
                    </Group>
                </Anchor>
            </Group>
        </Stack>
    );
};
