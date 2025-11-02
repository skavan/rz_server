import { pool } from '../src/db/index.js';

/**
 * Data migration: Populate locations.location_type_id based on first word of location.location_type
 * 
 * Logic:
 * - Extract first word from location.location_type (old string field)
 * - Find matching first word of location_types.name (case-insensitive)
 * - Match by customer_id (location -> home -> customer)
 * - Update location.location_type_id
 */

async function migrateLocationTypes() {
  console.log('🔄 Starting location_type_id migration...\n');

  try {
    const columnCheck = await pool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'locations'
        AND column_name = 'location_type'
      LIMIT 1
    `);

    if (columnCheck.rowCount === 0) {
      console.log('✅ locations.location_type column not found; no migration required.');
      return;
    }

    // Get all locations with their home's customer_id
    const locationsResult = await pool.query(`
      SELECT 
        l.id as location_id,
        l.name as location_name,
        l.location_type as old_location_type,
        h.customer_id
      FROM locations l
      INNER JOIN homes h ON l.home_id = h.id
      WHERE l.location_type_id IS NULL
      ORDER BY l.id
    `);

    const locations = locationsResult.rows;
    console.log(`📍 Found ${locations.length} locations to migrate\n`);

    if (locations.length === 0) {
      console.log('✅ No locations to migrate');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const failures: any[] = [];

    for (const location of locations) {
      const { location_id, location_name, old_location_type, customer_id } = location;

      // Skip if no old location_type
      if (!old_location_type) {
        console.log(`⚠️  Location #${location_id} "${location_name}" - No location_type to migrate`);
        failCount++;
        continue;
      }

      // Extract first word from old location_type field
      const firstWord = old_location_type.trim().split(/\s+/)[0];

      // Find matching location_type where first word of name matches (case-insensitive)
      const typeResult = await pool.query(
        `
        SELECT id, name 
        FROM location_types 
        WHERE customer_id = $1 
          AND LOWER(SPLIT_PART(name, ' ', 1)) = LOWER($2)
        LIMIT 1
        `,
        [customer_id, firstWord]
      );

      if (typeResult.rows.length > 0) {
        const locationType = typeResult.rows[0];

        // Update location with location_type_id
        await pool.query(
          `UPDATE locations SET location_type_id = $1 WHERE id = $2`,
          [locationType.id, location_id]
        );

        console.log(
          `✅ Location #${location_id} "${location_name}" → type "${locationType.name}" (id: ${locationType.id})`
        );
        successCount++;
      } else {
        console.log(
          `⚠️  Location #${location_id} "${location_name}" - No matching location_type found for "${firstWord}"`
        );
        failCount++;
        failures.push({
          location_id,
          location_name,
          first_word: firstWord,
          customer_id,
          old_location_type,
        });
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ⚠️  Failed: ${failCount}`);

    if (failures.length > 0) {
      console.log(`\n⚠️  Locations without matching types:\n`);
      console.table(
        failures.map((f) => ({
          ID: f.location_id,
          Name: f.location_name,
          'First Word': f.first_word,
          'Old Type': f.old_location_type || '(null)',
        }))
      );

      console.log(
        '\n💡 Tip: Create missing location_types or update location names to match existing types'
      );
    }

    console.log('\n✅ Migration complete!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration
migrateLocationTypes().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
