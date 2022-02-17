import execa from 'execa';

const args = process.argv.slice(2);
const env = process.env;

(async () => {
    await execa('dbt', args, {
        env,
        // stdout: process.stdout,
        stderr: process.stderr,
    });
})()
    .then(() => console.log('dbt success'))
    .catch((e) => console.error('dbt failed'));
