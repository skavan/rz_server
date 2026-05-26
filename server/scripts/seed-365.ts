#!/usr/bin/env tsx

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import {
  crmContacts,
  crmLeadSources,
  bookingReservations,
  bookingFinancials,
  bookingNotes,
  financeCommissions,
  pricingRates,
  sql,
} from '@skavan/rentalzen-drizzle';
import { db, pool } from '../src/db/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = resolve(__dirname, '../seed-data/365');

type SeedRow = Record<string, any>;

type SeedResult = {
  contacts: number;
  leadSources: number;
  reservations: number;
  financials: number;
  notes: number;
  commissions: number;
  rates: number;
};

function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === 't' || normalized === '1') return true;
  if (normalized === 'false' || normalized === 'f' || normalized === '0') return false;
  return null;
}

function parseMoney(value: unknown, fractionDigits = 2): string | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return (num / 100).toFixed(fractionDigits);
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parsePgStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String);
  const text = String(value).trim();
  if (!text || text === '{}') return [];
  const inner = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text;
  if (!inner) return [];
  return inner
    .split(',')
    .map((part) => part.trim())
    .map((part) => part.replace(/^"(.*)"$/s, '$1'))
    .filter((part) => part.length > 0);
}

function parseJson(value: unknown): any {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  const text = String(value);
  try {
    return JSON.parse(text);
  } catch {
    console.warn('⚠️  Failed to parse JSON field, returning raw string:', text.slice(0, 120));
    return text;
  }
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Normalize into an ISO-8601 compatible string where possible.
  let normalized = raw.replace(' ', 'T');

  // Trim fractional seconds down to milliseconds (ECMAScript only supports up to 3 digits).
  normalized = normalized.replace(/\.([0-9]{3})[0-9]+/, '.$1');

  // Ensure timezone offsets include a colon (e.g., -04 -> -04:00, -0400 -> -04:00).
  normalized = normalized.replace(/([+-]\d{2})(\d{2})?$/, (_match, hours: string, minutes?: string) => {
    const minutePortion = minutes ?? '00';
    return `${hours}:${minutePortion}`;
  });

  let date = new Date(normalized);

  // Retry after appending Z if parsing still fails and there is no explicit offset.
  if (Number.isNaN(date.valueOf()) && !/[+-]\d{2}:\d{2}$/.test(normalized) && !normalized.endsWith('Z')) {
    date = new Date(`${normalized}Z`);
  }

  if (Number.isNaN(date.valueOf())) {
    console.warn('⚠️  Failed to parse date value, returning null:', raw);
    return null;
  }

  return date;
}

async function loadRows(filename: string): Promise<SeedRow[]> {
  const filePath = resolve(DATA_DIR, filename);
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

async function ensureTablesAreEmpty(): Promise<void> {
  const [{ value: contactCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(crmContacts);
  if (contactCount > 0) {
    throw new Error('crm_contacts already has rows; aborting to avoid duplicate seed.');
  }
}

async function seedContacts(tx: any, rows: SeedRow[]) {
  const idMap = new Map<number, number>();
  let inserted = 0;
  for (const row of rows) {
    const record = {
      tenantId: row.tenant_id,
      externalId: row.external_id ?? null,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      secondaryPhone: row.secondary_phone ?? null,
      secondaryEmail: row.secondary_email ?? null,
      address: parseJson(row.address),
      dateOfBirth: row.date_of_birth ?? null,
      placeOfBirth: row.place_of_birth ?? null,
      fiscalCode: row.fiscal_code ?? null,
      phoneCountryCode: row.phone_country_code ?? null,
      occupation: row.occupation ?? null,
      jobTitle: row.job_title ?? null,
      companyName: row.company_name ?? null,
      websiteUrl: row.website_url ?? null,
      guestPartyId: parseNumber(row.guest_party_id),
      guestPartyRole: row.guest_party_role ?? null,
      ageAtBooking: parseNumber(row.age_at_booking),
      preferences: parseJson(row.preferences),
      emergencyContacts: parseJson(row.emergency_contacts),
      relationships: parseJson(row.relationships),
      communicationPreferences: parseJson(row.communication_preferences),
      status: row.status ?? null,
      tags: parsePgStringArray(row.tags),
      isPrimary: parseBoolean(row.is_primary),
      isMultipleTransactions: parseBoolean(row.is_multiple_transactions),
      notes: row.notes ?? null,
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      deletedAt: parseDate(row.deleted_at),
    };
    const [result] = await tx.insert(crmContacts).values(record).returning({ id: crmContacts.id });
    idMap.set(Number(row.id), result.id);
    inserted += 1;
  }
  return { idMap, inserted };
}

async function seedLeadSources(tx: any, rows: SeedRow[]) {
  const idMap = new Map<number, number>();
  let inserted = 0;
  for (const row of rows) {
    const record = {
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description ?? null,
      sourceType: row.source_type ?? null,
      defaultCommissionRate: row.default_commission_rate != null ? parseMoney(row.default_commission_rate, 4) : null,
      defaultCommissionType: row.default_commission_type ?? null,
      defaultCommissionAmount: row.default_commission_amount != null ? parseMoney(row.default_commission_amount) : null,
      isActive: parseBoolean(row.is_active),
      sortOrder: parseNumber(row.sort_order),
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
    };
    const [result] = await tx.insert(crmLeadSources).values(record).returning({ id: crmLeadSources.id });
    idMap.set(Number(row.id), result.id);
    inserted += 1;
  }
  return { idMap, inserted };
}

async function seedReservations(
  tx: any,
  rows: SeedRow[],
  contactMap: Map<number, number>,
  leadSourceMap: Map<number, number>,
) {
  const idMap = new Map<number, number>();
  let inserted = 0;
  for (const row of rows) {
    const record = {
      tenantId: row.tenant_id,
      homeId: row.home_id,
      primaryGuestId: row.primary_guest_id != null ? contactMap.get(Number(row.primary_guest_id)) ?? null : null,
      guestPartyId: parseNumber(row.guest_party_id),
      externalId: row.external_id ?? null,
      confirmationCode: row.confirmation_code ?? null,
      status: row.status,
      bookingType: row.booking_type ?? null,
      checkIn: parseDate(row.check_in),
      checkOut: parseDate(row.check_out),
      nights: parseNumber(row.nights),
      adults: parseNumber(row.adults),
      children: parseNumber(row.children),
      pets: parseNumber(row.pets),
      rent: row.rent != null ? parseMoney(row.rent) : null,
      taxes: row.taxes != null ? parseMoney(row.taxes) : null,
      services: row.services != null ? parseMoney(row.services) : null,
      discounts: row.discounts != null ? parseMoney(row.discounts) : null,
      commissions: row.commissions != null ? parseMoney(row.commissions) : null,
      expenses: row.expenses != null ? parseMoney(row.expenses) : null,
      guestTotal: row.guest_total != null ? parseMoney(row.guest_total) : null,
      ownerTotal: row.owner_total != null ? parseMoney(row.owner_total) : null,
      currency: row.currency ?? null,
      damageDeposit: row.damage_deposit != null ? parseMoney(row.damage_deposit) : null,
      fundsReceived: row.funds_received != null ? parseMoney(row.funds_received) : null,
      amountOutstanding: parseMoney(row.amount_outstanding),
      nextPaymentDueDate: parseDate(row.next_payment_due_date),
      leadSourceId: row.lead_source_id != null ? leadSourceMap.get(Number(row.lead_source_id)) ?? null : null,
      bookingChannelId: parseNumber(row.booking_channel_id),
      isOwnerBooking: parseBoolean(row.is_owner_booking),
      isPriceOverridden: parseBoolean(row.is_price_overridden),
      overrideReason: row.override_reason ?? null,
      housekeeperId: parseNumber(row.housekeeper_id),
      checkInManagerId: parseNumber(row.check_in_manager_id),
      conciergeId: parseNumber(row.concierge_id),
      language: row.language ?? null,
      specialRequests: row.special_requests ?? null,
      lockboxCode: row.lockbox_code ?? null,
      wifiPassword: row.wifi_password ?? null,
      createdBy: parseNumber(row.created_by),
      confirmedAt: parseDate(row.confirmed_at),
      cancelledAt: parseDate(row.cancelled_at),
      cancellationReason: row.cancellation_reason ?? null,
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      deletedAt: parseDate(row.deleted_at),
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      bedrooms: parseNumber(row.bedrooms),
      notes: row.notes ?? null,
      tags: parsePgStringArray(row.tags),
    };
    const [result] = await tx.insert(bookingReservations).values(record).returning({ id: bookingReservations.id });
    idMap.set(Number(row.id), result.id);
    inserted += 1;
  }
  return { idMap, inserted };
}

async function seedBookingFinancials(tx: any, rows: SeedRow[], reservationMap: Map<number, number>) {
  let inserted = 0;
  for (const row of rows) {
    const reservationId = reservationMap.get(Number(row.reservation_id));
    if (!reservationId) continue;
    const record = {
      reservationId,
      rent: parseMoney(row.rent),
      currency: row.currency ?? 'USD',
      taxes: parseJson(row.taxes),
      services: parseJson(row.services),
      discounts: parseJson(row.discounts),
      taxTotal: row.tax_total != null ? parseMoney(row.tax_total) : null,
      serviceTotal: row.service_total != null ? parseMoney(row.service_total) : null,
      discountTotal: row.discount_total != null ? parseMoney(row.discount_total) : null,
      grandTotal: parseMoney(row.grand_total),
      damageDeposit: row.damage_deposit != null ? parseMoney(row.damage_deposit) : null,
      channelFee: row.channel_fee != null ? parseMoney(row.channel_fee) : null,
      minNightlyPrice: row.min_nightly_price != null ? parseMoney(row.min_nightly_price) : null,
      maxNightlyPrice: row.max_nightly_price != null ? parseMoney(row.max_nightly_price) : null,
      isPaid: parseBoolean(row.is_paid),
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      externalId: row.external_id ?? null,
    };
    await tx.insert(bookingFinancials).values(record);
    inserted += 1;
  }
  return inserted;
}

async function seedBookingNotes(tx: any, rows: SeedRow[], reservationMap: Map<number, number>) {
  let inserted = 0;
  for (const row of rows) {
    const reservationId = reservationMap.get(Number(row.reservation_id));
    if (!reservationId) continue;
    const record = {
      reservationId,
      externalId: row.external_id ?? null,
      noteType: row.note_type,
      note: row.note,
      guestName: row.guest_name ?? null,
      guestEmail: row.guest_email ?? null,
      createdBy: parseNumber(row.created_by),
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      deletedAt: parseDate(row.deleted_at),
    };
    await tx.insert(bookingNotes).values(record);
    inserted += 1;
  }
  return inserted;
}

async function seedFinanceCommissions(
  tx: any,
  rows: SeedRow[],
  reservationMap: Map<number, number>,
  leadSourceMap: Map<number, number>,
  contactMap: Map<number, number>,
) {
  let inserted = 0;
  for (const row of rows) {
    const reservationId = reservationMap.get(Number(row.reservation_id));
    if (!reservationId) continue;
    const record = {
      tenantId: row.tenant_id,
      reservationId,
      name: row.name,
      type: row.type,
      leadSourceId: row.lead_source_id != null ? leadSourceMap.get(Number(row.lead_source_id)) ?? null : null,
      agentId: row.agent_id != null ? contactMap.get(Number(row.agent_id)) ?? null : null,
      agentName: row.agent_name ?? null,
      channelName: row.channel_name ?? null,
      isRateOverridden: parseBoolean(row.is_rate_overridden),
      originalRate: row.original_rate != null ? parseMoney(row.original_rate, 4) : null,
      calculationType: row.calculation_type,
      percentage: row.percentage != null ? parseMoney(row.percentage, 4) : null,
      fixedAmount: row.fixed_amount != null ? parseMoney(row.fixed_amount) : null,
      calculatedAmount: parseMoney(row.calculated_amount),
      currency: row.currency ?? null,
      calculationBase: row.calculation_base ?? null,
      paymentStatus: row.payment_status ?? null,
      paidAt: parseDate(row.paid_at),
      paymentMethod: row.payment_method ?? null,
      dueDate: parseDate(row.due_date),
      notes: row.notes ?? null,
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      externalId: row.external_id ?? null,
    };
    await tx.insert(financeCommissions).values(record);
    inserted += 1;
  }
  return inserted;
}

async function seedPricingRates(tx: any, rows: SeedRow[]) {
  let inserted = 0;
  for (const row of rows) {
    const record = {
      tenantId: row.tenant_id,
      homeId: row.home_id,
      baseYear: row.base_year,
      channel: row.channel,
      limitOccupant: row.limit_occupant,
      extraOccupantFee: parseJson(row.extra_occupant_fee),
      firstNightSurcharge: parseNumber(row.first_night_surcharge),
      oneNightStaySurcharge: parseNumber(row.one_night_stay_surcharge),
      seasons: parseJson(row.seasons),
      createdAt: parseDate(row.created_at) ?? new Date(),
      updatedAt: parseDate(row.updated_at) ?? new Date(),
      deletedAt: parseDate(row.deleted_at),
    };
    await tx.insert(pricingRates).values(record);
    inserted += 1;
  }
  return inserted;
}

async function run(): Promise<SeedResult> {
  await ensureTablesAreEmpty();

  const [contactsRows, leadSourceRows, reservationRows, financialRows, notesRows, commissionRows, rateRows] =
    await Promise.all([
      loadRows('crm_contacts.json'),
      loadRows('crm_lead_sources.json'),
      loadRows('booking_reservations.json'),
      loadRows('booking_financials.json'),
      loadRows('booking_notes.json'),
      loadRows('finance_commissions.json'),
      loadRows('pricing_rates.json'),
    ]);

  return db.transaction(async (tx: any) => {
    console.log('👥 Seeding crm_contacts...');
    const contactsResult = await seedContacts(tx, contactsRows);

    console.log('📈 Seeding crm_lead_sources...');
    const leadSourceResult = await seedLeadSources(tx, leadSourceRows);

    console.log('📘 Seeding booking_reservations...');
    const reservationResult = await seedReservations(tx, reservationRows, contactsResult.idMap, leadSourceResult.idMap);

    console.log('💰 Seeding booking_financials...');
    const financialCount = await seedBookingFinancials(tx, financialRows, reservationResult.idMap);

    console.log('📝 Seeding booking_notes...');
    const noteCount = await seedBookingNotes(tx, notesRows, reservationResult.idMap);

    console.log('💼 Seeding finance_commissions...');
    const commissionCount = await seedFinanceCommissions(
      tx,
      commissionRows,
      reservationResult.idMap,
      leadSourceResult.idMap,
      contactsResult.idMap,
    );

    console.log('📊 Seeding pricing_rates...');
    const rateCount = await seedPricingRates(tx, rateRows);

    return {
      contacts: contactsResult.inserted,
      leadSources: leadSourceResult.inserted,
      reservations: reservationResult.inserted,
      financials: financialCount,
      notes: noteCount,
      commissions: commissionCount,
      rates: rateCount,
    } satisfies SeedResult;
  });
}

run()
  .then((result) => {
    console.log('\n✅ 365 CRM/booking seed complete:', result);
    return pool.end().catch(() => undefined);
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ 365 seed failed:', err);
    return pool.end()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  });
