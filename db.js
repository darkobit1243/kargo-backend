const { Pool } = require('pg');

// Railway içi için fallback URL (DATABASE_URL tanımlı değilse burası kullanılır)
const fallbackUrl =
  'postgresql://postgres:EuBICrJOGohRVSbakjwPHPNEFpzhcth1@postgres.railway.internal:5432/railway';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || fallbackUrl,
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;

