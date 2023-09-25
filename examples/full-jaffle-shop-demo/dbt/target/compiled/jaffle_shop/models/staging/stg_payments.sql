with source as (
    select * from "postgres"."jaffle"."raw_payments"

),

renamed as (

    select
        id as payment_id,
        order_id,
        payment_method,

        --`amount` is currently stored in cents, so we convert it to dollars
        amount / 100 as amount

    from source

)

select * from renamed