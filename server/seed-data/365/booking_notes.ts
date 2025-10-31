/**
 * Plain TypeScript representation of public.booking_notes.
 * Generated 2025-10-31T22:04:04.056Z.
 */

export interface BookingNote {
  id: number;
  reservationId: number; // column: reservation_id
  externalId: string | null; // column: external_id
  noteType: string; // column: note_type
  note: string;
  guestName: string | null; // column: guest_name
  guestEmail: string | null; // column: guest_email
  createdBy: number | null; // column: created_by
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  deletedAt: string | null; // column: deleted_at
}
