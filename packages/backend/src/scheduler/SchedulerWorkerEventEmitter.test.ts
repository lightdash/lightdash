import EventEmitter from 'events';
import type { WorkerEvents } from 'graphile-worker';
import { wireWorkerHealthEvents } from './SchedulerWorkerEventEmitter';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

describe('wireWorkerHealthEvents', () => {
    it('routes pool:listen:success to markListenUp', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const markListenUp = jest.spyOn(health, 'markListenUp');
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('pool:listen:success', {});

        expect(markListenUp).toHaveBeenCalledTimes(1);
    });

    it('routes pool:listen:error to markListenLost', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const markListenLost = jest.spyOn(health, 'markListenLost');
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('pool:listen:error', {});

        expect(markListenLost).toHaveBeenCalledTimes(1);
    });

    it('routes job:start and job:complete to markJobActivity', () => {
        const emitter = new EventEmitter() as unknown as WorkerEvents;
        const health = new SchedulerWorkerHealth();
        const markJobActivity = jest.spyOn(health, 'markJobActivity');
        wireWorkerHealthEvents(emitter, health);

        (emitter as unknown as EventEmitter).emit('job:start', {});
        (emitter as unknown as EventEmitter).emit('job:complete', {});

        expect(markJobActivity).toHaveBeenCalledTimes(2);
    });
});
