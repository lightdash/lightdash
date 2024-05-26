// import { Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
// import { IconBoxMultiple, IconChevronRight } from '@tabler/icons-react';
// import { type FC } from 'react';
// import { useToggle } from 'react-use';
// import MantineIcon from '../../../components/common/MantineIcon';

// type Props = {
//     label: string;
// };

// export const CatalogGroup: FC<React.PropsWithChildren<Props>> = ({
//     label,
//     children,
// }) => {
//     const [isOpen, toggleOpen] = useToggle(false);

//     return (
//         <>
//             <UnstyledButton
//                 onClick={toggleOpen}
//                 sx={(theme) => ({
//                     backgroundColor: theme.colors.gray[3],
//                     borderRadius: theme.radius.sm,
//                     padding: theme.spacing.xs,
//                     width: '100%',
//                 })}
//             >
//                 <Group spacing={'sm'}>
//                     <MantineIcon
//                         icon={IconChevronRight}
//                         size={14}
//                         style={{
//                             margin: 1,
//                             transition: 'transform 200ms ease',
//                             transform: isOpen ? 'rotate(90deg)' : undefined,
//                         }}
//                     />
//                     <MantineIcon
//                         size={'xl'}
//                         color="gray"
//                         icon={IconBoxMultiple}
//                     />
//                     <Text fw={600} fz={14}>
//                         {label}
//                     </Text>
//                 </Group>
//             </UnstyledButton>
//             <Collapse in={isOpen} pl="xl">
//                 <Box>{children}</Box>
//             </Collapse>
//         </>
//     );
// };
