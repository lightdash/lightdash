import { subject } from '@casl/ability';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { Can } from '../../../providers/Ability';
import classes from './adminHomepageControls.module.css';

type Props = {
    projectUuid: string;
    organizationUuid: string | undefined;
    showNewHomepage?: boolean;
};

// Pinned top-right, just below the navbar, for anyone who can manage the
// project homepage — styled to match the builder's own toolbar buttons.
export const AdminHomepageControls: FC<Props> = ({
    projectUuid,
    organizationUuid,
    showNewHomepage = false,
}) => {
    const navigate = useNavigate();
    return (
        <Can
            I="manage"
            this={subject('ProjectHomepage', { organizationUuid, projectUuid })}
        >
            <div className={classes.corner}>
                {showNewHomepage && (
                    <button
                        type="button"
                        className={classes.tbBtn}
                        aria-label="New homepage"
                        onClick={() =>
                            navigate(
                                `/projects/${projectUuid}/homepage-builder?create=1`,
                            )
                        }
                    >
                        <MantineIcon icon={IconPlus} size={15} />
                        <span className={classes.tbBtnLabel} aria-hidden="true">
                            New homepage
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    className={classes.tbBtn}
                    aria-label="Customize homepage"
                    onClick={() =>
                        navigate(`/projects/${projectUuid}/homepage-builder`)
                    }
                >
                    <MantineIcon icon={IconEdit} size={15} />
                    <span className={classes.tbBtnLabel} aria-hidden="true">
                        Customize homepage
                    </span>
                </button>
            </div>
        </Can>
    );
};
