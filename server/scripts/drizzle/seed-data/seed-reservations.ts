#!/usr/bin/env tsx
/**
 * Seed Reservations Data
 * 
 * Imports booking data from JSON file into reservations table
 * Maps all bookings to customerId=1, homeId=1 as per tenant structure
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../../src/db/index.js';
import { reservations } from '@skavan/rentalzen-drizzle';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const seedDataPath = join(__dirname, '../../../seed-data/bookings-2018-01-01-to-2026-12-31-2025-10-23.json');

async function seedReservations() {
  console.log('🏨 Seeding reservations data...\n');

  try {
    // Read the bookings JSON file
    const rawData = readFileSync(seedDataPath, 'utf8');
    const data = JSON.parse(rawData);
    
    console.log(`📊 Found ${data.metadata.totalBookings} bookings in JSON file`);
    console.log(`📅 Date range: ${data.metadata.dateRange.start} to ${data.metadata.dateRange.end}`);
    console.log(`🏠 Property ID: ${data.metadata.propertyId}\n`);

    // Clear existing reservations
    console.log('🗑️  Clearing existing reservations...');
    await db.delete(reservations);
    console.log('✅ Existing reservations cleared\n');

    // Transform and insert bookings
    console.log('📝 Transforming and inserting bookings...');
    
    const reservationData = data.bookings.map((booking: any) => ({
      // Tenant fields (required by multi-tenant pattern)
      customerId: 1,
      homeId: 1,
      
      // External booking system ID
      bookingId: booking.bookingId,
      
      // Guest information
      firstName: booking.firstName || null,
      lastName: booking.lastName || null,
      fullName: booking.fullName || null,
      email: booking.email || null,
      birthday: booking.birthday === "0000-00-00" ? null : booking.birthday,
      birthplace: booking.birthplace || null,
      phone1: booking.phone1 || null,
      phone2: booking.phone2 || null,
      country: booking.country || null,
      phoneCountryCode: booking.phone_country_code || null,
      address: booking.address || null,
      city: booking.city || null,
      state: booking.state || null,
      postcode: booking.postcode || null,
      fiscalCode: booking.fiscal_code || null,
      other: booking.other || null,
      
      // Booking status and notes
      status: booking.status,
      agreeTermNote: booking.agreeTermNote || null,
      managerNote: booking.managerNote || null,
      
      // Property and booking references
      propertyName: booking.propertyName || null,
      propertyId: booking.propertyId || null,
      ownerBook: booking.ownerBook || 0,
      leadsourceId: booking.leadsourceId || null,
      brandId: booking.brandId || null,
      
      // Financial details
      totalRent: booking.totalRent ? booking.totalRent.toString() : null,
      taxTotal: booking.taxTotal ? booking.taxTotal.toString() : null,
      serviceTotal: booking.serviceTotal ? booking.serviceTotal.toString() : null,
      discountTotal: booking.discountTotal ? booking.discountTotal.toString() : null,
      grandTotal: booking.grandTotal ? booking.grandTotal.toString() : null,
      damageDeposit: booking.damageDeposit ? booking.damageDeposit.toString() : null,
      channelFee: booking.channelFee ? booking.channelFee.toString() : null,
      currency: booking.currency || 'USD',
      
      // Stay details
      checkin: booking.checkin ? new Date(booking.checkin) : null,
      checkout: booking.checkout ? new Date(booking.checkout) : null,
      qtyOfNights: booking.qtyofnights || null,
      minNightlyPrice: booking.minNightlyPrice ? booking.minNightlyPrice.toString() : null,
      maxNightlyPrice: booking.maxNightlyPrice ? booking.maxNightlyPrice.toString() : null,
      nightlyPriceDetail: booking.nightlyPriceDetail || null,
      
      // Guest count and stay requirements
      numberOfAdults: booking.numberofadults || null,
      numberOfChildren: booking.numberofchildren || null,
      minimumStay: booking.minimumStay || null,
      maximumStay: booking.maximumStay || null,
      
      // Additional booking data (arrays from JSON)
      discount: booking.discount || null,
      dynamicOptions: booking.dynamicOptions || null,
      tax: booking.tax || null,
      service: booking.service || null,
      
      // Timestamps
      createdDate: booking.createdDate ? new Date(booking.createdDate) : null,
      updatedDate: booking.updatedDate ? new Date(booking.updatedDate) : null,
      cancellationDate: booking.cancellationDate ? new Date(booking.cancellationDate) : null,
      
      // System fields
      isActive: true,
    }));

    // Insert in batches to avoid memory issues
    const batchSize = 50;
    let inserted = 0;
    
    for (let i = 0; i < reservationData.length; i += batchSize) {
      const batch = reservationData.slice(i, i + batchSize);
      await db.insert(reservations).values(batch);
      inserted += batch.length;
      process.stdout.write(`\r📦 Inserted: ${inserted}/${reservationData.length} reservations`);
    }
    
    console.log('\n✅ All reservations seeded successfully!\n');
    
    // Summary
    const totalCount = await db.select().from(reservations);
    console.log(`📊 Final count: ${totalCount.length} reservations in database`);
    console.log(`🏠 All mapped to customerId=1, homeId=1`);
    console.log(`💰 Financial data preserved as decimal strings`);
    console.log(`📅 Date fields properly converted to timestamps`);
    
  } catch (error) {
    console.error('❌ Error seeding reservations:', error);
    process.exit(1);
  }
}

// Run the seeding
seedReservations()
  .then(() => {
    console.log('\n🎉 Reservations seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  });