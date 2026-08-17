import { type ApiErrorDetail } from '@lightdash/common';
import { Code, Stack, Text } from '@mantine/core';
import {
    IconAlertCircle,
    IconLock,
    IconMoodPuzzled,
} from '@tabler/icons-react';
import React, {
    useMemo,
    type ComponentProps,
    type FC,
    type ReactNode,
} from 'react';
import { getCandidateExploreNames } from '../../../utils/exploreSplitError';
import CodeBlock from '../CodeBlock/CodeBlock';
import SuboptimalState from '../SuboptimalState/SuboptimalState';

const DEFAULT_ERROR_PROPS: ComponentProps<typeof SuboptimalState> = {
    icon: IconAlertCircle,
    title: 'Unexpected error',
    description: 'Please contact support',
};

const ErrorState: FC<{
    error?: ApiErrorDetail | null;
    hasMarginTop?: boolean;
    action?: ReactNode;
}> = ({ error, hasMarginTop = true, action }) => {
    const props = useMemo<ComponentProps<typeof SuboptimalState>>(() => {
        if (!error) {
            return DEFAULT_ERROR_PROPS;
        }
        try {
            const description = (
                <>
                    <Text maw={400}>{error.message}</Text>
                    {(error.sentryEventId || error.sentryTraceId) && (
                        <>
                            <Text maw={400} fw="bold">
                                Contact support with the following information:
                            </Text>
                            <CodeBlock
                                code={`\nError ID: ${
                                    error.sentryEventId || 'n/a'
                                }\nTrace ID: ${error.sentryTraceId || 'n/a'}`}
                                language="yaml"
                                pr="lg"
                                ta="left"
                            />
                        </>
                    )}
                </>
            );
            const candidateExploreNames = getCandidateExploreNames(error.data);
            const isExploreSplitError =
                error.statusCode === 404 &&
                typeof error.data?.exploreName === 'string' &&
                candidateExploreNames.length >= 2;
            if (isExploreSplitError) {
                return {
                    icon: IconMoodPuzzled,
                    title: 'Explore was split',
                    description: (
                        <Stack gap="xs" align="center">
                            <Text maw={400}>{error.message}</Text>
                            {candidateExploreNames.map((candidate) => (
                                <Code key={candidate}>{candidate}</Code>
                            ))}
                        </Stack>
                    ),
                    action,
                };
            }
            switch (error.name) {
                case 'ForbiddenError':
                    return {
                        icon: IconLock,
                        title: 'You need access',
                        description,
                    };
                case 'AuthorizationError':
                    return {
                        icon: IconLock,
                        title: 'Authorization error',
                        description,
                    };
                case 'NotFoundError':
                    return {
                        icon: IconMoodPuzzled,
                        title: 'Not found',
                        description,
                    };
                default:
                    return {
                        ...DEFAULT_ERROR_PROPS,
                        description,
                    };
            }
        } catch {
            return DEFAULT_ERROR_PROPS;
        }
    }, [action, error]);

    return (
        <SuboptimalState mt={hasMarginTop ? '20px' : undefined} {...props} />
    );
};

export default ErrorState;
