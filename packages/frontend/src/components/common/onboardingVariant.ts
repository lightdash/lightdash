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
    Record<'default' | 'explained', { title: string; subtitle: string }>
> = {
    warehouse: {
        default: {
            title: 'Where does your data live?',
            subtitle: 'Pick your warehouse. Aurora runs its queries there.',
        },
        explained: {
            title: 'Connect your warehouse',
            subtitle:
                'Aurora answers questions by querying your warehouse directly. Your data stays where it is.',
        },
    },
    tools: {
        default: {
            title: 'Bring in your other tools',
            subtitle:
                'Connect product or marketing tools so Aurora can answer across them. You can also do this later from home.',
        },
        explained: {
            title: "Add the data your warehouse doesn't have",
            subtitle:
                'Product and marketing numbers often live in other tools. Connect them and Aurora can answer across all of it, like signups by campaign. Optional, and you can do it later from home.',
        },
    },
    team: {
        default: {
            title: 'Connect Slack and GitHub',
            subtitle:
                'Send dashboards and alerts to Slack, and save metric changes as pull requests on GitHub. You can also do this later from home.',
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
