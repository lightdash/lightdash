import { useLocalStorage } from '@mantine/hooks';

export type OnboardingVariant = 'a' | 'b' | 'c';

export const ONBOARDING_VARIANTS: {
    value: OnboardingVariant;
    label: string;
}[] = [
    { value: 'a', label: 'A: card' },
    { value: 'b', label: 'B: explained' },
    { value: 'c', label: 'C: split visuals' },
];

export const useOnboardingVariant = () =>
    useLocalStorage<OnboardingVariant>({
        key: 'ld.onboarding.variant',
        defaultValue: 'c',
        getInitialValueInEffect: false,
    });

export type OnboardingCopyStep = 'warehouse' | 'tools' | 'team';

const COPY: Record<
    OnboardingCopyStep,
    Record<'default' | 'explained', { title: string; subtitle: string | null }>
> = {
    warehouse: {
        default: {
            title: 'Connect your data',
            subtitle: null,
        },
        explained: {
            title: 'Connect your warehouse',
            subtitle:
                'Answers query your warehouse directly. Your data stays where it is.',
        },
    },
    tools: {
        default: {
            title: 'Bring in your other tools',
            subtitle: 'Optional. You can add these later from settings.',
        },
        explained: {
            title: 'Connect your other tools',
            subtitle:
                'Each query reads from the tool directly, so nothing is copied into your warehouse. You can add these later from settings.',
        },
    },
    team: {
        default: {
            title: 'Connect Slack and GitHub',
            subtitle: 'You can also do this later from home.',
        },
        explained: {
            title: 'Connect Slack and GitHub',
            subtitle:
                'With Slack, dashboards and alerts land in your channels and anyone can ask a question in a thread. With GitHub, new metrics and charts become pull requests you approve. You can do this later from home.',
        },
    },
};

export const useStepCopy = (step: OnboardingCopyStep) => {
    const [variant] = useOnboardingVariant();
    return COPY[step][variant === 'b' ? 'explained' : 'default'];
};
