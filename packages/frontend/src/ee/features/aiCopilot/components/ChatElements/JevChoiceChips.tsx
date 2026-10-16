import { type AiAgentJevChoice } from '@lightdash/common';
import { Button, Group } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
    choices: AiAgentJevChoice[];
    onSelect: (prompt: string) => void;
};

/** Options JEV offered when it could not tell which edit was meant; a click sends that option. */
export const JevChoiceChips: FC<Props> = ({ choices, onSelect }) => {
    const { t } = useTranslation('aiCopilotChat');
    return choices.length === 0 ? null : (
        <Group gap="xs" aria-label={t('jevChoices.ariaLabel')}>
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
};
