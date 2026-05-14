with source as (

    select * from {{ ref('raw_european_cities') }}

),

renamed as (

    select
        name,
        country_code,
        lon,
        lat,
        population

    from source

)

select * from renamed
