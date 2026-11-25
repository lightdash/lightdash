import { Anchor, Box, Loader, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import { useLiveSourceContentUsage } from '../hooks/useLiveSourceFields';

/** How many charts and dashboards the dialog names before "and N more". */
const SHOWN = 10;

const ContentList: FC<{
    title: string;
    items: { uuid: string; name: string }[];
    /** Items in spaces the editor can't open, counted but not named. */
    hiddenCount: number;
    toUrl: (uuid: string) => string;
}> = ({ title, items, hiddenCount, toUrl }) =>
    items.length + hiddenCount === 0 ? null : (
        <Box>
            <Text fz="sm" fw={500} mb={4}>
                {title}
            </Text>
            <Stack gap={2} component="ul" m={0} pl="md">
                {items.slice(0, SHOWN).map(({ uuid, name }) => (
                    <Text component="li" fz="sm" key={uuid}>
                        <Anchor
                            component={Link}
                            to={toUrl(uuid)}
                            target="_blank"
                            fz="sm"
                        >
                            {name}
                        </Anchor>
                    </Text>
                ))}
                {items.length > SHOWN ? (
                    <Text component="li" fz="sm" c="dimmed">
                        and {(items.length - SHOWN).toLocaleString()} more
                    </Text>
                ) : null}
                {hiddenCount > 0 ? (
                    <Text component="li" fz="sm" c="dimmed">
                        {hiddenCount.toLocaleString()} in spaces you can’t open
                    </Text>
                ) : null}
            </Stack>
        </Box>
    );

/**
 * Asks before switching off an explore or a field that saved charts use,
 * naming the charts and dashboards that stop showing results.
 */
export const LiveSourceSwitchOffModal: FC<{
    projectUuid: string;
    connectionUuid: string;
    exploreName: string;
    /** The field's name in its explore; null to switch off the whole explore. */
    fieldName: string | null;
    /** What is being switched off, as people see it. */
    label: string;
    isSaving: boolean;
    onConfirm: () => void;
    onClose: () => void;
}> = ({
    projectUuid,
    connectionUuid,
    exploreName,
    fieldName,
    label,
    isSaving,
    onConfirm,
    onClose,
}) => {
    const { data: usage, isInitialLoading } = useLiveSourceContentUsage({
        projectUuid,
        connectionUuid,
        exploreName,
        fieldName,
    });
    const what = fieldName === null ? 'explore' : 'field';
    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`Switch off "${label}"?`}
            role="alertdialog"
            confirmLabel="Switch off"
            confirmLoading={isSaving}
            cancelDisabled={isSaving}
            onConfirm={onConfirm}
        >
            <Stack gap="sm">
                <Text fz="sm">
                    {fieldName === null
                        ? 'Saved charts on this explore show that it is switched off instead of results, and agents stop using it, until you switch it back on.'
                        : 'Saved charts using this field stop showing results, and agents stop using it, until you switch it back on.'}
                </Text>
                {isInitialLoading ? (
                    <Loader size="xs" />
                ) : usage ? (
                    <>
                        <ContentList
                            title={`Charts on this ${what}`}
                            items={usage.charts}
                            hiddenCount={usage.hiddenChartCount}
                            toUrl={(uuid) =>
                                `/projects/${projectUuid}/saved/${uuid}`
                            }
                        />
                        <ContentList
                            title="Dashboards with those charts"
                            items={usage.dashboards}
                            hiddenCount={usage.hiddenDashboardCount}
                            toUrl={(uuid) =>
                                `/projects/${projectUuid}/dashboards/${uuid}`
                            }
                        />
                    </>
                ) : null}
            </Stack>
        </MantineModal>
    );
};
