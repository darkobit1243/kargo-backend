const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'myapp',
    password: '421475',
    port: 5432
});

module.exports = pool;


