with source as (

    select * from {{ ref('raw_order_currencies') }}

),

renamed as (

    select
        order_id,
        currency,
        converted_amount

    from source

)

select * from renamed
