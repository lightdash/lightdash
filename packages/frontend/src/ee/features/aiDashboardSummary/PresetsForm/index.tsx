import { DashboardSummaryTone, type DashboardSummary } from '@lightdash/common';
import { Button, Flex, Select, Stack, Textarea } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { capitalize } from 'lodash';
import { type FC } from 'react';
import { z } from 'zod';
import { getToneEmoji } from '../utils';
import AudienceInput from './AudienceInput';

type PresetsFormProps = {
    summary?: DashboardSummary;
    isLoading: boolean;
    onFormSubmit: (
        presets: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
    ) => void;
    handleCancel: () => void;
};

const validationSchema = z.object({
    context: z.string().optional(),
    tone: z.nativeEnum(DashboardSummaryTone),
    audiences: z.string().array(),
});

type PresetFormValues = z.infer<typeof validationSchema>;

// this never changes so we can keep it outside of the component
const TONE_SELECT_DATA = Object.values(DashboardSummaryTone).map((tone) => ({
    value: tone,
    label: `${getToneEmoji(tone)} ${capitalize(tone)}`,
}));

const placeholder = `Give extra context to help us generate your dashboard summary.

Here are some examples:
  - The dashboard this summary is for includes charts about our user engagement.
  - This summary is meant to be shared with the sales team, keep it focused on sales metrics.
  - This summary is going to be presented to non-technical people, please keep it simple.
  - We have a goal to increase our sales by 20%, include a specific section about that in the summary.`;

const PresetsForm: FC<PresetsFormProps> = ({
    summary,
    isLoading,
    onFormSubmit,
    handleCancel,
}) => {
    const form = useForm<PresetFormValues>({
        initialValues: {
            context: summary?.context ?? undefined, // in db it is null, but form should be initialized with undefined otherwise it warns about controlled/uncontrolled input
            tone: summary?.tone || DashboardSummaryTone.FRIENDLY,
            audiences: summary?.audiences ?? [],
        },
        validate: zodResolver(validationSchema),
    });

    return (
        <form
            id="dashboard-summary-presets-form"
            onSubmit={form.onSubmit(onFormSubmit)}
        >
            <Stack w="100%">
                <Select
                    label="Tone of voice"
                    data={TONE_SELECT_DATA}
                    withinPortal
                    w="25%"
                    {...form.getInputProps('tone')}
                />
                <AudienceInput
                    label="Summary Audiences (optional)"
                    w="35%"
                    {...form.getInputProps('audiences')}
                />
                <Textarea
                    label="Additional Context (optional)"
                    placeholder={placeholder}
                    autosize
                    minRows={10}
                    maxRows={10}
                    {...form.getInputProps('context')}
                />

                <Flex gap="md" justify="flex-end">
                    <Button type="submit" loading={isLoading}>
                        Generate Dashboard Summary
                    </Button>
                    <Button
                        onClick={handleCancel}
                        variant="subtle"
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default PresetsForm;
