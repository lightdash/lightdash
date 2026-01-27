import { type SummaryExplore } from '@lightdash/common';
import { Group, NavLink } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { type FC, useTransition } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useToggle } from 'react-use';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import MantineIcon from '../../common/MantineIcon';
import ExploreNavLink from './ExploreNavLink';

type Props = {
    label: string;
    explores: SummaryExplore[];
    searchQuery: string;
};

const ExploreGroup: FC<Props> = ({ label, explores, searchQuery }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const navigate = useNavigate();
    const location = useLocation();
    const projectUuid = useProjectUuid();
    const [, startTransition] = useTransition();

    return (
        <NavLink
            opened={isOpen}
            onClick={toggleOpen}
            // --start moves chevron to the left
            // mostly hardcoded, to match mantine's internal sizes
            disableRightSectionRotation
            rightSection={<></>}
            icon={
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    style={{
                        margin: 1,
                        transition: 'transform 200ms ease',
                        transform: isOpen ? 'rotate(90deg)' : undefined,
                    }}
                />
            }
            // --end
            label={<Group>{label}</Group>}
        >
            {isOpen &&
                explores.map((explore) => (
                    <ExploreNavLink
                        key={explore.name}
                        explore={explore}
                        query={searchQuery}
                        onClick={() => {
                            startTransition(() => {
                                void navigate({
                                    pathname: `/projects/${projectUuid}/tables/${explore.name}`,
                                    search: location.search,
                                });
                            });
                        }}
                    />
                ))}
        </NavLink>
    );
};

export default ExploreGroup;
