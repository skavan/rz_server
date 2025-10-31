/**
 * Plain TypeScript representation of public.crm_contacts.
 * Generated 2025-10-31T22:04:04.043Z.
 */

export interface CrmContact {
  id: number;
  tenantId: number; // column: tenant_id
  externalId: string | null; // column: external_id
  firstName: string | null; // column: first_name
  lastName: string | null; // column: last_name
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null; // column: secondary_phone
  secondaryEmail: string | null; // column: secondary_email
  address: unknown | null;
  dateOfBirth: string | null; // column: date_of_birth
  placeOfBirth: string | null; // column: place_of_birth
  fiscalCode: string | null; // column: fiscal_code
  phoneCountryCode: string | null; // column: phone_country_code
  occupation: string | null;
  jobTitle: string | null; // column: job_title
  companyName: string | null; // column: company_name
  websiteUrl: string | null; // column: website_url
  guestPartyId: number | null; // column: guest_party_id
  guestPartyRole: string | null; // column: guest_party_role
  ageAtBooking: number | null; // column: age_at_booking
  preferences: unknown | null;
  emergencyContacts: unknown | null; // column: emergency_contacts
  relationships: unknown | null;
  communicationPreferences: unknown | null; // column: communication_preferences
  status: string | null;
  tags: string[] | null;
  isPrimary: boolean | null; // column: is_primary
  isMultipleTransactions: boolean | null; // column: is_multiple_transactions
  notes: string | null;
  createdAt: string; // column: created_at
  updatedAt: string; // column: updated_at
  deletedAt: string | null; // column: deleted_at
}
