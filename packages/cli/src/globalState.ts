import ora from 'ora';
import * as styles from './styles';

class GlobalState {
    private verbose: boolean = false;

    private activeSpinner: ora.Ora | undefined;

    getActiveSpinner() {
        return this.activeSpinner;
    }

    startSpinner(options?: ora.Options | string): ora.Ora {
        this.activeSpinner = ora(options);
        this.activeSpinner.start();
        return this.activeSpinner;
    }

    log(message: any, ...optionalParams: any[]) {
        const spinner = this.getActiveSpinner();
        const shouldRestartSpinner = spinner?.isSpinning;
        spinner?.stop();
        console.error(message, ...optionalParams);
        if (shouldRestartSpinner) {
            spinner?.start();
        }
    }

    setVerbose(verbose: boolean) {
        this.verbose = verbose;
    }

    debug(message: string) {
        if (this.verbose) {
            this.log(styles.debug(message));
        }
    }
}

export default new GlobalState();
