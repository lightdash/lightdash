import express from 'express';
import http from 'http';

const app = express();
const server = http.createServer(app);

['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGUSR2'].forEach((signal) => {
    process.on(signal, async () => {
        console.log(`Received ${signal}`, Date.now());

        return new Promise((resolve, reject) => {
            console.log('Closing', Date.now());
            server.close((err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    console.log('Closed', Date.now());
                    setTimeout(resolve, 30000); // 30 seconds
                }
            });
        }).then(() => {
            console.log('Resolved', Date.now());
            process.exit(0);
        });
    });
});

server.listen(8081);
