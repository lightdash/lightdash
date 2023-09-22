with source as (
    select * from "postgres"."jaffle"."raw_customers"

),

renamed as (

    select
        id as customer_id,
        first_name,
        last_name,
        created

    from source

)

select * from renamed