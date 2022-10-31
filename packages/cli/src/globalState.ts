import ora from 'ora';

class GlobalState {
    private activeSpinner: ora.Ora | undefined;

    getActiveSpinner() {
        return this.activeSpinner;
    }

    startSpinner(options?: ora.Options | string): ora.Ora {
        this.activeSpinner = ora(options);
        this.activeSpinner.start();
        return this.activeSpinner;
    }
}

export default new GlobalState();
