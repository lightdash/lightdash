import { Group, Radio, Text, TextInput } from '@mantine/core';
import {
    IconBrandGithub,
    IconBrandGoogle,
    IconBrandLinkedin,
    IconBrandReddit,
    IconBrandX,
    IconBrandYoutube,
    IconCalendarEvent,
    IconDots,
    IconMail,
    IconMicrophone2,
    IconSparkles,
    IconUsers,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import classes from './ReferralSourcePicker.module.css';

const OTHER = 'Other';

type Source = {
    label: string;
    icon: Icon;
    // A follow-up asked once the source is picked; required only for Other
    followUp: { label: string; placeholder: string } | null;
};

const SOURCES: Source[] = [
    { label: 'Google', icon: IconBrandGoogle, followUp: null },
    {
        label: 'AI',
        icon: IconSparkles,
        followUp: {
            label: 'Which assistant?',
            placeholder: 'ChatGPT, Claude, Perplexity…',
        },
    },
    { label: 'Friend or coworker', icon: IconUsers, followUp: null },
    { label: 'LinkedIn', icon: IconBrandLinkedin, followUp: null },
    { label: 'X.com', icon: IconBrandX, followUp: null },
    { label: 'YouTube', icon: IconBrandYoutube, followUp: null },
    { label: 'Reddit', icon: IconBrandReddit, followUp: null },
    { label: 'GitHub', icon: IconBrandGithub, followUp: null },
    {
        label: 'Podcast',
        icon: IconMicrophone2,
        followUp: { label: 'Which podcast?', placeholder: 'Name of the show' },
    },
    {
        label: 'Event',
        icon: IconCalendarEvent,
        followUp: { label: 'Which event?', placeholder: 'Name of the event' },
    },
    {
        label: 'Newsletter',
        icon: IconMail,
        followUp: {
            label: 'Which newsletter?',
            placeholder: 'Name of the newsletter',
        },
    },
    {
        label: OTHER,
        icon: IconDots,
        followUp: {
            label: 'Where did you hear about us?',
            placeholder: 'Tell us where',
        },
    },
];

// Restores the picker from the saved answer when the step remounts
const parseAnswer = (
    value: string,
): { choice: string | null; detail: string } => {
    if (!value) return { choice: null, detail: '' };
    const source = SOURCES.find(
        ({ label }) =>
            label !== OTHER &&
            (value === label || value.startsWith(`${label}: `)),
    );
    return source
        ? { choice: source.label, detail: value.slice(source.label.length + 2) }
        : { choice: OTHER, detail: value };
};

const toAnswer = (choice: string, detail: string): string => {
    if (choice === OTHER) return detail;
    return detail.trim() ? `${choice}: ${detail}` : choice;
};

type Props = {
    value: string;
    onChange: (value: string) => void;
    error: ReactNode;
};

/** Picks a source in one click, with a short follow-up where the detail is useful */
export const ReferralSourcePicker: FC<Props> = ({ value, onChange, error }) => {
    const [{ choice, detail }, setAnswer] = useState(() => parseAnswer(value));
    const followUp = SOURCES.find(({ label }) => label === choice)?.followUp;
    const update = (nextChoice: string, nextDetail: string) => {
        setAnswer({ choice: nextChoice, detail: nextDetail });
        onChange(toAnswer(nextChoice, nextDetail));
    };

    return (
        <>
            <Radio.Group
                label="How did you hear about us?"
                required
                value={choice}
                onChange={(next) => update(next, '')}
                error={choice === OTHER ? null : error}
            >
                <Group gap={8} mt={8}>
                    {SOURCES.map(({ label, icon }) => (
                        <Radio.Card
                            key={label}
                            value={label}
                            className={classes.chip}
                        >
                            <MantineIcon icon={icon} size={16} />
                            <Text span size="sm" inherit>
                                {label}
                            </Text>
                        </Radio.Card>
                    ))}
                </Group>
            </Radio.Group>
            {choice && followUp && (
                <TextInput
                    key={choice}
                    label={followUp.label}
                    placeholder={followUp.placeholder}
                    autoFocus
                    value={detail}
                    onChange={(event) =>
                        update(choice, event.currentTarget.value)
                    }
                    error={choice === OTHER ? error : null}
                />
            )}
        </>
    );
};
