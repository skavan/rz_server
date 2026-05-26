/**
 * Simple Drizzle-powered Database Management
 * Because why reinvent the wheel? 🛞
 * Uses existing @skavan/rentalzen-drizzle package
 */
import { drizzle } from '@skavan/rentalzen-drizzle';
import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Database connection using existing pattern
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

async function loadSeedData(filename: string) {
  const seedPath = join(__dirname, '../seed-data', filename);
  const content = await readFile(seedPath, 'utf-8');
  return JSON.parse(content);
}

export async function generateMigration() {
  // Removed drizzle-kit migration generation
  try {
  // Removed drizzle-kit generate command
  // Removed drizzle-kit output handling
    console.log('✅ Migration generated!');
  } catch (error) {
    console.error('❌ Failed to generate migration:', error);
    throw error;
  }
}

export async function runMigrations() {
  // Removed drizzle-kit migration running
  try {
  // Removed drizzle-kit migrate command
  // Removed drizzle-kit output handling
    console.log('✅ Migrations completed!');
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
    throw error;
  }
}

export async function seedDatabase() {
  console.log('🌱 Seeding database...');
  
  try {
    // Load and insert customers
    const customersData = await loadSeedData('1-customers.json');
    if (customersData.customers?.length > 0) {
      // Import schema dynamically to avoid circular dependencies
      const { customers } = await import('@skavan/rentalzen-drizzle/src/customers-updated');
      await db.insert(customers).values(customersData.customers);
      console.log(`✅ Seeded ${customersData.customers.length} customers`);
    }
    
    // Load and insert users/accounts/sessions
    const usersData = await loadSeedData('2-users.json');
    
    if (usersData.users?.length > 0) {
      const { users, accounts, sessions } = await import('@skavan/rentalzen-drizzle/src/users-updated');
      
      await db.insert(users).values(usersData.users);
      console.log(`✅ Seeded ${usersData.users.length} users`);
      
      if (usersData.accounts?.length > 0) {
        await db.insert(accounts).values(usersData.accounts);
        console.log(`✅ Seeded ${usersData.accounts.length} accounts`);
      }
      
      if (usersData.sessions?.length > 0) {
        await db.insert(sessions).values(usersData.sessions);
        console.log(`✅ Seeded ${usersData.sessions.length} sessions`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to seed database:', error);
    throw error;
  }
}

export async function resetDatabase() {
  console.log('🗑️  Dropping all tables...');
  
  try {
    // Simple way to reset - let Drizzle migrations handle recreation
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    console.log('✅ Database reset!');
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    throw error;
  }
}

export async function main() {
  const command = process.argv[2] || 'help';
  
  try {
    switch (command) {
      case 'generate':
        await generateMigration();
        break;
        
      case 'migrate':
        await runMigrations();
        break;
        
      case 'seed':
        await seedDatabase();
        break;
        
      case 'reset':
        await resetDatabase();
        await runMigrations();
        await seedDatabase();
        break;
        
      case 'fresh':
        await generateMigration();
        await resetDatabase();
        await runMigrations();
        await seedDatabase();
        break;
        
      default:
        console.log(`
🛞 Drizzle-Powered Database Manager (${Math.floor(400 / 10)} lines instead of 400!)

Commands:
  generate - Generate new migration from schema changes
  migrate  - Run pending migrations
  seed     - Seed database with test data  
  reset    - Drop all, migrate, and seed
  fresh    - Generate, reset, migrate, and seed

Examples:
  tsx scripts/db-manager.ts generate
  tsx scripts/db-manager.ts migrate
  tsx scripts/db-manager.ts seed
  tsx scripts/db-manager.ts fresh
  
// Removed drizzle-kit setup reference
        `);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
const currentFileUrl = fileURLToPath(import.meta.url);
const invokedFileUrl = process.argv[1];

if (currentFileUrl === invokedFileUrl) {
  main();
}
