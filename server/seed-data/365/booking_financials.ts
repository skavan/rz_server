/**
 * Plain TypeScript representation of public.booking_financials.
 * Generated 2025-10-31T22:04:04.053Z.
 */

export interface BookingFinancial {
  id: number;
  reservationId: number; // column: reservation_id
  rent: number;
  currency: string;
  taxes: unknown | null;
  services: unknown | null;
  discounts: unknown | null;
  taxTotal: number | null; // column: tax_total
  serviceTotal: number | null; // column: service_total
  discountTotal: number | null; // column: discount_total
  grandTotal: number; // column: grand_total
  damageDeposit: number | null; // column: damage_deposit
  channelFee: number | null; // column: channel_fee
  minNightlyPrice: number | null; // column: min_nightly_price
  maxNightlyPrice: number | null; // column: max_nightly_price
  isPaid: boolean | null; // column: is_paid
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  externalId: string | null; // column: external_id
}
