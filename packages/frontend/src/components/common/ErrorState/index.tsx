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
import { useTranslation } from 'react-i18next';
import { getCandidateExploreNames } from '../../../utils/exploreSplitError';
import CodeBlock from '../CodeBlock/CodeBlock';
import SuboptimalState from '../SuboptimalState/SuboptimalState';

const ErrorState: FC<{
    error?: ApiErrorDetail | null;
    hasMarginTop?: boolean;
    action?: ReactNode;
}> = ({ error, hasMarginTop = true, action }) => {
    const { t } = useTranslation('commonUi');
    const props = useMemo<ComponentProps<typeof SuboptimalState>>(() => {
        const defaultErrorProps: ComponentProps<typeof SuboptimalState> = {
            icon: IconAlertCircle,
            title: t('errorState.unexpectedError'),
            description: t('errorState.contactSupport'),
        };
        if (!error) {
            return defaultErrorProps;
        }
        try {
            const description = (
                <>
                    <Text maw={400}>{error.message}</Text>
                    {(error.sentryEventId || error.sentryTraceId) && (
                        <>
                            <Text maw={400} fw="bold">
                                {t('errorState.contactSupportWithInfo')}
                            </Text>
                            <CodeBlock
                                code={`\n${t('errorState.errorId', {
                                    id: error.sentryEventId || 'n/a',
                                })}\n${t('errorState.traceId', {
                                    id: error.sentryTraceId || 'n/a',
                                })}`}
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
                    title: t('errorState.exploreSplit'),
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
                        title: t('errorState.needAccess'),
                        description,
                    };
                case 'AuthorizationError':
                    return {
                        icon: IconLock,
                        title: t('errorState.authorizationError'),
                        description,
                    };
                case 'NotFoundError':
                    return {
                        icon: IconMoodPuzzled,
                        title: t('errorState.notFound'),
                        description,
                    };
                default:
                    return {
                        ...defaultErrorProps,
                        description,
                    };
            }
        } catch {
            return defaultErrorProps;
        }
    }, [action, error, t]);

    return (
        <SuboptimalState mt={hasMarginTop ? '20px' : undefined} {...props} />
    );
};

export default ErrorState;
