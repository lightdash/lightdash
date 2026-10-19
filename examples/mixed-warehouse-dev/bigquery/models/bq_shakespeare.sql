{{ config(materialized='view', database='bigquery-public-data', schema='samples', alias='shakespeare') }}
select word, word_count, corpus, corpus_date from `bigquery-public-data.samples.shakespeare`
