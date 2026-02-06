CREATE TABLE IF NOT EXISTS rss AS
SELECT * FROM read_ndjson('db/**/rss/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    title: 'VARCHAR',
    link: 'VARCHAR'
});
