import { type AiAgentJevChoice } from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    choices: AiAgentJevChoice[];
    onSelect: (prompt: string) => void;
};

/** Options JEV offered when it could not tell which edit was meant; a click sends that option. */
export const JevChoiceChips: FC<Props> = ({ choices, onSelect }) =>
    choices.length === 0 ? null : (
        <Group gap="xs" aria-label="Suggested answers">
            {choices.map((choice) => (
                <Button
                    key={choice.prompt}
                    size="xs"
                    variant="default"
                    onClick={() => onSelect(choice.prompt)}
                >
                    {choice.label}
                </Button>
            ))}
        </Group>
    );
