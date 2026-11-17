import {
    type ExternalConnectionTestResponse,
    type LiveSourceTestCheck,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Code,
    Collapse,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertCircleFilled,
    IconChevronRight,
    IconCircleCheckFilled,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './ConnectionTestResult.module.css';

const MAX_BODY_RENDER_CHARS = 4000;

const statusColor = (status: number): string => {
    if (status < 300) return 'green';
    if (status < 500) return 'yellow';
    return 'red';
};

type Props = {
    response: ExternalConnectionTestResponse;
};

/** Status badge, content type and a truncated preview of the response body. */
const RawTestResponse: FC<Props> = ({ response }) => (
    <Stack gap="xs">
        <Group gap="xs">
            <Badge color={statusColor(response.status)}>
                {response.status}
            </Badge>
            <Text fz="xs" c="dimmed">
                {response.contentType}
            </Text>
            {response.truncated && <Badge color="yellow">truncated</Badge>}
        </Group>

        <ScrollArea.Autosize mah={260} w="100%" offsetScrollbars>
            <Code block fz="xs" className={classes.body}>
                {(typeof response.body === 'string'
                    ? response.body
                    : JSON.stringify(response.body, null, 2)
                ).slice(0, MAX_BODY_RENDER_CHARS)}
            </Code>
        </ScrollArea.Autosize>
    </Stack>
);

/** A live data source test as an admin reads it; the raw response stays one click away. */
const LiveSourceTestResult: FC<Props & { check: LiveSourceTestCheck }> = ({
    response,
    check,
}) => {
    const [showDetails, setShowDetails] = useState(false);
    const color = check.ok ? 'green' : 'red';

    return (
        <Paper
            withBorder
            radius="md"
            p="sm"
            className={classes.check}
            data-ok={check.ok}
            role="status"
        >
            <Group gap="sm" align="flex-start" wrap="nowrap">
                <MantineIcon
                    icon={
                        check.ok ? IconCircleCheckFilled : IconAlertCircleFilled
                    }
                    color={color}
                    size="lg"
                    className={classes.statusIcon}
                />
                <Stack gap="xs" className={classes.content}>
                    <Stack gap={2}>
                        <Text fz="sm" fw={600}>
                            {check.summary}
                        </Text>
                        {check.detail && (
                            <Text fz="sm" c="dimmed">
                                {check.detail}
                            </Text>
                        )}
                    </Stack>
                    {check.facts.length > 0 && (
                        <Group gap="xl">
                            {check.facts.map((fact) => (
                                <Stack key={fact.label} gap={0}>
                                    <Text fz="xs" c="dimmed">
                                        {fact.label}
                                    </Text>
                                    <Text
                                        fz="sm"
                                        fw={600}
                                        className={classes.factValue}
                                    >
                                        {fact.value}
                                    </Text>
                                </Stack>
                            ))}
                        </Group>
                    )}
                    <Box>
                        <Button
                            variant="subtle"
                            color="gray"
                            c="dimmed"
                            size="compact-xs"
                            ml={-6}
                            onClick={() => setShowDetails((open) => !open)}
                            aria-expanded={showDetails}
                            leftSection={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size="sm"
                                    className={classes.chevron}
                                    data-open={showDetails}
                                />
                            }
                        >
                            {showDetails ? 'Hide details' : 'Show details'}
                        </Button>
                        <Collapse expanded={showDetails}>
                            <Box pt="xs">
                                <RawTestResponse response={response} />
                            </Box>
                        </Collapse>
                    </Box>
                </Stack>
            </Group>
        </Paper>
    );
};

/** Renders a connection test: a plain-language result for live data sources,
 *  the raw response otherwise. Shared by the live data source dialogs and the
 *  data app wizard and Examples tab. */
export const ConnectionTestResult: FC<Props> = ({ response }) =>
    response.liveCheck ? (
        <LiveSourceTestResult response={response} check={response.liveCheck} />
    ) : (
        <RawTestResponse response={response} />
    );
