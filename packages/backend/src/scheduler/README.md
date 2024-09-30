# Scheduler

## Scheduler worker

This scheduler worker takes the jobs from the queue and run the specific method from `SchedulerTask`

It also runs the cronjob to daily generate jobs for that day.

All tasks are wrapped in a tryOrTimeout method that will `kill` the Promise and unlock the worker after some time.

## Scheduler tasks

The logic for the jobs that runs on scheduler. We have some tasks like:

### handleScheduledDelivery

This is the main entrypoint for all scheduled deliveries for all scheduler types and targets.

A scheduled delivery can have multiple targets (slack/email) if it is type `image` or `csv`; but for type==Gsheets we only run a subtask (and it has no targets, the details about gsheets are in schedulerOptions)

For gsheets we don't get the Page data (that downloads csvs or images (needed for slack or email "multiple" targets) ) , for gsheets we simply schedule the gsheets task (and do the log + analytics) (see below)

This way, once we add this tasks to the scheduler dashboard we should see

    for google upload: handle -> gsheetsUpload
    for slack/email : handle -> slackNotification + emailNotification

### sendEmailNotification / sendSlackNotification

Get the pageData details generated on `handleScheduledDelivery` and use the `slackClient/emailClient` to send the info to the `channel/recipient`

### uploadGsheets

This task does not depend on `pageData` from `handleScheduledDelivery` but instead this method does a `runQuery`to get the `rows` from the warehouse and uploads directly to `gsheets` using `GoogleDriveClient`.

### downloadCsv

### compileProject

### testAndCompileProject

### validateProject
