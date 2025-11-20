const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Postgres connection
const pool = new Pool({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  user: 'postgres.nldgaczpzfmwamivniua',
  password: 'Riju@389022',
  database: 'postgres',
  port: 6543
});

// Test if API works
app.get('/', (req, res) => {
  res.send('API working');
});

// Test if Postgres works
app.get('/db', async (req, res) => {
  try {
    const q = await pool.query('SELECT NOW()');
    res.json(q.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
