import { Paper, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import { InteractivityQuestions } from './InteractivityQuestions';

export const ControlInteractivity: FC<{ controlId: string }> = ({
    controlId,
}) => (
    <Paper p="md">
        <Stack gap="xs">
            <Title order={5}>Viewer controls</Title>
            <InteractivityQuestions
                subject={{ kind: 'control', id: controlId }}
                field={null}
                rows={['who', 'where']}
            />
        </Stack>
    </Paper>
);
