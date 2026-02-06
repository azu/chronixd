CREATE TABLE IF NOT EXISTS github_search AS
SELECT * FROM read_ndjson('db/github-search/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    resultType: 'VARCHAR',
    nameWithOwner: 'VARCHAR',
    title: 'VARCHAR',
    state: 'VARCHAR',
    author: 'VARCHAR',
    number: 'INTEGER'
});
