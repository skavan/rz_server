/**
 * Plain TypeScript representation of public.pricing_rates.
 * Generated 2025-10-31T22:04:04.064Z.
 */

export interface PricingRate {
  id: number;
  tenantId: number; // column: tenant_id
  homeId: number; // column: home_id
  baseYear: number; // column: base_year
  channel: string;
  limitOccupant: number; // column: limit_occupant
  extraOccupantFee: unknown; // column: extra_occupant_fee
  firstNightSurcharge: number; // column: first_night_surcharge
  oneNightStaySurcharge: number; // column: one_night_stay_surcharge
  seasons: unknown;
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  deletedAt: string | null; // column: deleted_at
}
