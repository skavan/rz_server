import { pool } from './src/db/index.js';

async function main() {
  // Check what fetchUserScope would return for each user
  const users = await pool.query('SELECT id, email, customer_id FROM users ORDER BY id');
  
  for (const user of users.rows) {
    const homesRes = await pool.query(
      'SELECT home_id FROM user_home_access WHERE user_id = $1',
      [user.id]
    );
    const homeIds = homesRes.rows.map((r: any) => r.home_id);
    
    console.log(`User ${user.id} (${user.email}): customerId=${user.customer_id}, homeIds=[${homeIds.join(', ')}]`);
    
    // Check for the issue
    if (homeIds.length > 10) {
      console.log('  ⚠️ SUSPICIOUS - too many homeIds!');
    }
    if (new Set(homeIds).size !== homeIds.length) {
      console.log('  ⚠️ DUPLICATES FOUND in query result!');
    }
  }
  
  await pool.end();
}

main().catch(console.error);
