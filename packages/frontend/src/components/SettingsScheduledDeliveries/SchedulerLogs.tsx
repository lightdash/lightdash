{
    /* <td>
{
    getHumanReadableCronExpression(
        scheduler.cron,
    ).split(',')[0]
}
</td>
<td>
{log.scheduledTime
    ? formatTime(
          log.scheduledTime,
      )
    : 'Delivery not started yet'}
</td>
</tr>
);
})
) : isLoading ? (
<tr>
<td colSpan={5}>
<Group position="center" spacing="xs">
<Loader size="xs" color="gray" />
<Title
order={6}
ta="center"
fw={500}
color="gray.6"
>
Scheduled deliveries loading...
</Title>
</Group>
</td>
</tr>
) : (
<tr>
<td colSpan={5}>
<Title
order={6}
ta="center"
fw={500}
color="gray.6"
>
No scheduled deliveries on this
project yet.
</Title>
</td>
</tr>
)}
</tbody>
</Table> */
}
