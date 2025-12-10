import { pool } from './src/db/index.js';

async function main() {
  const res = await pool.query(`
    SELECT uha.*, u.email 
    FROM user_home_access uha
    JOIN users u ON u.id = uha.user_id
    ORDER BY user_id, home_id
  `);
  
  console.log('user_home_access rows:', res.rows.length);
  console.table(res.rows);
  
  // Check for duplicates
  const duplicates = await pool.query(`
    SELECT user_id, home_id, COUNT(*) as count
    FROM user_home_access
    GROUP BY user_id, home_id
    HAVING COUNT(*) > 1
  `);
  
  if (duplicates.rows.length > 0) {
    console.log('\n⚠️ DUPLICATE ENTRIES FOUND:');
    console.table(duplicates.rows);
  } else {
    console.log('\n✅ No duplicates found');
  }
  
  await pool.end();
}

main().catch(console.error);
