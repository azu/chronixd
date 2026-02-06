CREATE TABLE IF NOT EXISTS github_events AS
SELECT * FROM read_ndjson('db/**/github-events/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    eventType: 'VARCHAR',
    action: 'VARCHAR',
    repo: 'VARCHAR',
    title: 'VARCHAR',
    body: 'VARCHAR',
    number: 'INTEGER',
    state: 'VARCHAR'
});
