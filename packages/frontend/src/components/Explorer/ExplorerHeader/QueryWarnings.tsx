import { type QueryWarning } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Divider,
    Popover,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { Fragment, useState, type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../common/MantineIcon';
import PaginateControl from '../../common/PaginateControl';

const WARNINGS_PER_PAGE = 3;

type QueryWarningsProps = {
    queryWarnings: QueryWarning[];
};

const QueryWarnings: FC<QueryWarningsProps> = ({ queryWarnings }) => {
    const [warningsPopoverOpened, setWarningsPopoverOpened] = useState(false);
    const [warningsPage, setWarningsPage] = useState(1);

    return (
        <Popover
            opened={warningsPopoverOpened}
            onClose={() => setWarningsPopoverOpened(false)}
            position="bottom"
            width={400}
            withArrow
        >
            <Popover.Target>
                <Tooltip label="Query warnings">
                    <ActionIcon
                        color="yellow"
                        variant="subtle"
                        onClick={() => {
                            setWarningsPopoverOpened((o) => !o);
                            if (!warningsPopoverOpened) {
                                setWarningsPage(1);
                            }
                        }}
                    >
                        <MantineIcon icon={IconAlertCircle} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Title order={6} fw={600}>
                    Query warnings
                </Title>
                <Stack spacing="xs" mt={'md'}>
                    {queryWarnings
                        .slice(
                            (warningsPage - 1) * WARNINGS_PER_PAGE,
                            warningsPage * WARNINGS_PER_PAGE,
                        )
                        .map((warning, index, array) => (
                            <Fragment key={index}>
                                <Box>
                                    <MarkdownPreview
                                        source={warning.message}
                                        rehypePlugins={[
                                            [
                                                rehypeExternalLinks,
                                                { target: '_blank' },
                                            ],
                                        ]}
                                        style={{
                                            fontSize: 'small',
                                        }}
                                    />
                                </Box>
                                {index < array.length - 1 && (
                                    <Divider color="gray.2" />
                                )}
                            </Fragment>
                        ))}
                </Stack>
                {queryWarnings.length > WARNINGS_PER_PAGE && (
                    <Box mt="md">
                        <PaginateControl
                            currentPage={warningsPage}
                            totalPages={Math.ceil(
                                queryWarnings.length / WARNINGS_PER_PAGE,
                            )}
                            onPreviousPage={() =>
                                setWarningsPage((p) => Math.max(1, p - 1))
                            }
                            hasPreviousPage={warningsPage > 1}
                            onNextPage={() =>
                                setWarningsPage((p) =>
                                    Math.min(
                                        Math.ceil(
                                            queryWarnings.length /
                                                WARNINGS_PER_PAGE,
                                        ),
                                        p + 1,
                                    ),
                                )
                            }
                            hasNextPage={
                                warningsPage <
                                Math.ceil(
                                    queryWarnings.length / WARNINGS_PER_PAGE,
                                )
                            }
                            position="center"
                        />
                    </Box>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default QueryWarnings;
