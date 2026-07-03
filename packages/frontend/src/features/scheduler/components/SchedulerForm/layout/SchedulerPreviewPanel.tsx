import { SchedulerFormat } from '@lightdash/common';
import { Button, Paper, Select, Stack, Text } from '@mantine-8/core';
import { IconMail, IconPaperclip, IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

const RenderWidthFooter: FC = () => (
    <div className={classes.previewFooter}>
        <Select
            label="Render width"
            data={[
                { value: '1400', label: 'Laptop · 1400px' },
                { value: '1920', label: 'Desktop · 1920px' },
                { value: '768', label: 'Tablet · 768px' },
            ]}
            defaultValue="1400"
            comboboxProps={{ withinPortal: true }}
        />
    </div>
);

const ImagePreviewStub: FC = () => (
    <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)">
        <Stack gap="sm">
            <Text fw={600} size="sm">
                Dashboard preview
            </Text>
            <Paper
                radius="sm"
                h={180}
                bg="var(--mantine-color-default-hover)"
            />
            <Text size="xs" c="dimmed">
                A rendered screenshot appears here once wired up.
            </Text>
        </Stack>
    </Paper>
);

const EmailMockStub: FC<{ format: SchedulerFormat }> = ({ format }) => {
    const ext = format === SchedulerFormat.XLSX ? 'xlsx' : 'csv';
    return (
        <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)">
            <Stack gap="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Email preview
                </Text>
                <Text fw={600} size="sm">
                    <MantineIcon
                        icon={IconMail}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 6, marginBottom: -2 }}
                    />
                    Your scheduled delivery
                </Text>
                <Paper
                    radius="sm"
                    h={64}
                    bg="var(--mantine-color-default-hover)"
                />
                <Paper withBorder radius="sm" p="xs">
                    <Text size="xs">
                        <MantineIcon
                            icon={IconPaperclip}
                            size="sm"
                            display="inline"
                            style={{ marginRight: 6, marginBottom: -2 }}
                        />
                        data.{ext}
                    </Text>
                </Paper>
            </Stack>
        </Paper>
    );
};

export const SchedulerPreviewPanel: FC = () => {
    const form = useSchedulerFormContext();
    const format = form.values.format;
    const isImageLike =
        format === SchedulerFormat.IMAGE || format === SchedulerFormat.PDF;

    return (
        <aside className={classes.preview}>
            <div className={classes.previewHeader}>
                <span className={classes.previewLabel}>Live preview</span>
                <Button
                    variant="subtle"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconRefresh} size="sm" />}
                >
                    Regenerate
                </Button>
            </div>
            <div className={classes.previewBody}>
                {isImageLike ? (
                    <ImagePreviewStub />
                ) : (
                    <EmailMockStub format={format} />
                )}
            </div>
            {isImageLike && <RenderWidthFooter />}
        </aside>
    );
};
