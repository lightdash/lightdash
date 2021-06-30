import {lightdashApi} from "../api";
import {ApiError, ApiHealthResults, HealthState} from "common";
import React, {useState} from "react";
import {useQuery} from "react-query";
import {AnchorButton, Callout, Classes, Dialog, H5, H6, Intent, Tag} from "@blueprintjs/core";

const getHealthState = async () => {
    return await lightdashApi<ApiHealthResults>({
        url: `/health`,
        method: 'GET',
        body: undefined,
    })
}

const AboutFooter = () => {
    const [isOpen, setIsOpen] = useState(false);
    const healthState = useQuery<HealthState, ApiError>({
        queryKey: 'health',
        queryFn: getHealthState,
    })

    const hasUpdate = healthState.data?.latest.version && healthState.data.version !== healthState.data.latest.version;

    return (
        <>
            <footer style={{display: 'inline-flex', gap: '10px', cursor: 'pointer', alignItems: 'center', marginTop: '20px'}}
                    onClick={() => setIsOpen(true)}>
                <img src={`${process.env.PUBLIC_URL}/favicon-16x16.png`} alt="Lightdash"/>
                <H6 style={{margin: 0}}>Lightdash - v{healthState.data?.version}</H6>
                {hasUpdate && <Tag minimal={true} intent={Intent.PRIMARY}>New version available!</Tag>}
            </footer>
            <Dialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                icon="info-sign"
                title="About Lightdash"
            >
                <div className={Classes.DIALOG_BODY}>
                    <H5><b>Version:</b> v{healthState.data?.version}</H5>
                    {hasUpdate && (
                        <Callout title={"New version available!"} intent={Intent.PRIMARY}>
                            The version v{healthState.data?.latest.version}) is now available. Please follow the
                            instructions in the <a href="https://docs.lightdash.com/guides/how-to-update-docker-image" target={'_blank'}>
                            How to update version
                        </a> documentation.
                        </Callout>
                    )}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <AnchorButton
                            href="https://docs.lightdash.com/"
                            target="_blank"
                            outlined={true}
                            rightIcon={'share'}
                        >
                            Docs
                        </AnchorButton>
                        <AnchorButton
                            href="https://github.com/lightdash/lightdash"
                            target="_blank"
                            outlined={true}
                            rightIcon={'share'}
                        >
                            Github
                        </AnchorButton>
                    </div>
                </div>
            </Dialog>
        </>
    )
}

export default AboutFooter;