import { Group, Radio, SimpleGrid, Text, TextInput } from '@mantine/core';
import {
    IconBrandGithub,
    IconBrandGoogle,
    IconBrandLinkedin,
    IconBrandOpenai,
    IconBrandReddit,
    IconBrandX,
    IconBrandYoutube,
    IconCalendarEvent,
    IconDots,
    IconMicrophone2,
    IconNews,
    IconUsers,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import classes from './ReferralSourcePicker.module.css';

const OTHER = 'Other';

const SOURCES: { label: string; icon: Icon }[] = [
    { label: 'Google', icon: IconBrandGoogle },
    { label: 'AI assistant', icon: IconBrandOpenai },
    { label: 'A colleague', icon: IconUsers },
    { label: 'LinkedIn', icon: IconBrandLinkedin },
    { label: 'X', icon: IconBrandX },
    { label: 'YouTube', icon: IconBrandYoutube },
    { label: 'Reddit', icon: IconBrandReddit },
    { label: 'GitHub', icon: IconBrandGithub },
    { label: 'Podcast', icon: IconMicrophone2 },
    { label: 'Event', icon: IconCalendarEvent },
    { label: 'Newsletter', icon: IconNews },
    { label: OTHER, icon: IconDots },
];

type Props = {
    value: string;
    onChange: (value: string) => void;
    error: ReactNode;
};

/** Picks a common source in one click; "Other" opens a free-text answer */
export const ReferralSourcePicker: FC<Props> = ({ value, onChange, error }) => {
    const [isOther, setIsOther] = useState(false);
    const selected = isOther
        ? OTHER
        : (SOURCES.find(({ label }) => label === value)?.label ?? null);

    return (
        <>
            <Radio.Group
                label="How did you hear about us?"
                required
                value={selected}
                onChange={(next) => {
                    setIsOther(next === OTHER);
                    onChange(next === OTHER ? '' : next);
                }}
                error={isOther ? null : error}
            >
                <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs" mt={6}>
                    {SOURCES.map(({ label, icon }) => (
                        <Radio.Card
                            key={label}
                            value={label}
                            className={classes.tile}
                        >
                            <Group gap={8} wrap="nowrap">
                                <MantineIcon icon={icon} size={16} />
                                <Text size="sm" truncate>
                                    {label}
                                </Text>
                            </Group>
                        </Radio.Card>
                    ))}
                </SimpleGrid>
            </Radio.Group>
            {isOther && (
                <TextInput
                    aria-label="Where did you hear about us?"
                    placeholder="Where did you hear about us?"
                    size="md"
                    autoFocus
                    value={value}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    error={error}
                />
            )}
        </>
    );
};
