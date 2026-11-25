import { assertUnreachable, type TableListingFailure } from '@lightdash/common';
import { Button, Code, Collapse, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './TableListingFailureNotice.module.css';

const qualified = (...parts: (string | null)[]) =>
    parts.filter((part) => part !== null).join('.') || null;

const describeTableListingFailure = (failure: TableListingFailure): string => {
    switch (failure.kind) {
        case 'missing_privilege': {
            const target = qualified(failure.catalog, failure.schema);
            const privilege = failure.privilege ?? 'a privilege';
            return target
                ? `Can't list tables: the connection's user is missing ${privilege} on ${target}`
                : `Can't list tables: the connection's user is missing ${privilege}`;
        }
        case 'no_information_schema':
            return failure.catalog
                ? `Can't list tables in ${failure.catalog}: it has no information_schema`
                : "Can't list tables: the catalog has no information_schema";
        case 'catalog_not_found':
            return failure.catalog
                ? `Can't list tables: the catalog ${failure.catalog} was not found`
                : "Can't list tables: the catalog was not found";
        case 'other':
            return "Can't list tables";
        default:
            return assertUnreachable(failure, 'Unknown table listing failure');
    }
};

/** Why tables can't be listed, with the warehouse's own message behind a toggle. */
export const TableListingFailureNotice: FC<{
    failure: TableListingFailure;
}> = ({ failure }) => {
    const [opened, { toggle }] = useDisclosure(false);
    return (
        <Stack gap={4} align="flex-start">
            <Text fz="xs">{describeTableListingFailure(failure)}</Text>
            <Button
                variant="subtle"
                size="compact-xs"
                onClick={toggle}
                aria-expanded={opened}
                leftSection={
                    <MantineIcon
                        icon={opened ? IconChevronDown : IconChevronRight}
                    />
                }
            >
                Details
            </Button>
            <Collapse expanded={opened} w="100%">
                <Code block fz="xs" className={classes.message}>
                    {failure.message}
                </Code>
            </Collapse>
        </Stack>
    );
};
