import { Anchor, Group, Text } from '@mantine/core';
import { type FC } from 'react';

export type DbtAnswer = 'yes' | 'no';

/** A settled onboarding choice, collapsed to one line so the next question has room */
const ChoiceSummary: FC<{
    value: string;
    onChange: () => void;
}> = ({ value, onChange }) => (
    <Group gap={6} wrap="nowrap">
        <Text fw={500} size="sm" truncate>
            {value}
        </Text>
        <Text c="dimmed" size="sm" aria-hidden>
            ·
        </Text>
        <Anchor
            component="button"
            type="button"
            c="dimmed"
            size="sm"
            onClick={onChange}
        >
            Change
        </Anchor>
    </Group>
);

export const DbtAnswerSummary: FC<{
    value: DbtAnswer;
    onChange: () => void;
}> = ({ value, onChange }) => (
    <ChoiceSummary
        value={value === 'yes' ? 'I use dbt' : "I don't use dbt"}
        onChange={onChange}
    />
);
