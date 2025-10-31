/**
 * Plain TypeScript representation of public.booking_reservations.
 * Generated 2025-10-31T22:04:04.049Z.
 */

export interface BookingReservation {
  id: number;
  tenantId: number; // column: tenant_id
  homeId: number; // column: home_id
  primaryGuestId: number | null; // column: primary_guest_id
  guestPartyId: number | null; // column: guest_party_id
  externalId: string | null; // column: external_id
  confirmationCode: string | null; // column: confirmation_code
  status: string;
  bookingType: string | null; // column: booking_type
  checkIn: string; // column: check_in
  checkOut: string; // column: check_out
  nights: number;
  adults: number;
  children: number;
  pets: number;
  rent: number | null;
  taxes: number | null;
  services: number | null;
  discounts: number | null;
  commissions: number | null;
  expenses: number | null;
  guestTotal: number | null; // column: guest_total
  ownerTotal: number | null; // column: owner_total
  currency: string | null;
  damageDeposit: number | null; // column: damage_deposit
  fundsReceived: number | null; // column: funds_received
  amountOutstanding: number; // column: amount_outstanding
  nextPaymentDueDate: string | null; // column: next_payment_due_date
  leadSourceId: number | null; // column: lead_source_id
  bookingChannelId: number | null; // column: booking_channel_id
  isOwnerBooking: boolean | null; // column: is_owner_booking
  isPriceOverridden: boolean | null; // column: is_price_overridden
  overrideReason: string | null; // column: override_reason
  housekeeperId: number | null; // column: housekeeper_id
  checkInManagerId: number | null; // column: check_in_manager_id
  conciergeId: number | null; // column: concierge_id
  language: string | null;
  specialRequests: string | null; // column: special_requests
  lockboxCode: string | null; // column: lockbox_code
  wifiPassword: string | null; // column: wifi_password
  createdBy: number; // column: created_by
  confirmedAt: string | null; // column: confirmed_at
  cancelledAt: string | null; // column: cancelled_at
  cancellationReason: string | null; // column: cancellation_reason
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  deletedAt: string | null; // column: deleted_at
  firstName: string | null; // column: first_name
  lastName: string | null; // column: last_name
  bedrooms: number | null;
  notes: string | null;
  tags: string[] | null;
}
