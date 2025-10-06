import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/rental_inventory'
});

async function checkUserHomes() {
  try {
    await client.connect();
    console.log('Connected to database\n');
    
    // Check user
    const userResult = await client.query(`
      SELECT id, email, first_name, last_name 
      FROM users 
      WHERE email = 'suresh.kavan@gmail.com'
    `);
    console.log('User:', userResult.rows[0]);
    
    if (userResult.rows.length === 0) {
      console.log('User not found!');
      return;
    }
    
    const userId = userResult.rows[0].id;
    
    // Check home access
    const accessResult = await client.query(`
      SELECT uha.*, h.name as home_name
      FROM user_home_access uha
      LEFT JOIN homes h ON uha.home_id = h.id
      WHERE uha.user_id = $1
    `, [userId]);
    
    console.log('\nHome Access Records:', accessResult.rows);
    console.log('\nTotal homes accessible:', accessResult.rows.length);
    
    // Check all homes
    const homesResult = await client.query('SELECT id, name FROM homes LIMIT 5');
    console.log('\nAvailable Homes:', homesResult.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkUserHomes();
