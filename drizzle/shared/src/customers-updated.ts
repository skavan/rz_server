/**
 * Updated Customers Schema with Field Sets
 */
import { 
  pgTable, 
  serial, 
  integer,
  varchar, 
  text, 
  boolean, 
  timestamp, 
  jsonb,
  unique,
  index
} from 'drizzle-orm/pg-core';

// ============================================
// CUSTOMERS TABLE - UPDATED
// ============================================
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  
  // Updated name fields
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  
  // Business info
  companyName: varchar('company_name', { length: 255 }),
  
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  
  // Subscription info
  subscriptionStatus: varchar('subscription_status', { length: 20 }).default('active').$type<'active' | 'pending' | 'cancelled' | 'suspended' | 'trial'>(),
  subscriptionPlan: varchar('subscription_plan', { length: 50 }),
  maxHomes: integer('max_homes').default(5),
  
  // Stripe integration
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }).unique(),
  stripeData: jsonb('stripe_data'),
  
  // Additional fields
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  
  // Trial and billing
  trialEndsAt: timestamp('trial_ends_at'),
  subscriptionStartsAt: timestamp('subscription_starts_at'),
  lastPaymentDate: timestamp('last_payment_date'),
  paymentFailedCount: integer('payment_failed_count').default(0),
  
  // Support and features
  supportPriority: varchar('support_priority', { length: 20 }).default('standard').$type<'low' | 'standard' | 'high' | 'enterprise'>(),
  
  // Flexible data
  billingAddress: jsonb('billing_address'),
  settings: jsonb('settings'),
  communicationPreferences: jsonb('communication_preferences'),
  
  // Audit fields
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('idx_customers_status').on(table.subscriptionStatus),
  slugIdx: index('idx_customers_slug').on(table.slug),
  stripeIdx: index('idx_customers_stripe').on(table.stripeCustomerId),
  emailIdx: index('idx_customers_email').on(table.email),
  trialIdx: index('idx_customers_trial').on(table.trialEndsAt),
}));

// ============================================
// STANDARDIZED FIELD SETS
// ============================================
export const CustomerFieldSets = {
  // Size-based (universal keys)
  minimal: [
    'id', 
    'firstName', 
    'lastName'
  ] as const,
  
  lite: [
    'id', 
    'firstName', 
    'lastName', 
    'slug', 
    'subscriptionStatus'
  ] as const,
  
  default: [
    'id', 
    'firstName', 
    'lastName', 
    'slug', 
    'email', 
    'subscriptionStatus', 
    'subscriptionPlan',
    'maxHomes',
    'timezone'
  ] as const,
  
  full: [
    'id',
    'firstName',
    'lastName', 
    'companyName',
    'slug',
    'email',
    'phone',
    'subscriptionStatus',
    'subscriptionPlan',
    'maxHomes',
    'stripeCustomerId',
    'timezone',
    'avatarUrl',
    'onboardingCompleted',
    'trialEndsAt',
    'subscriptionStartsAt',
    'supportPriority',
    'billingAddress',
    'settings',
    'communicationPreferences',
    'createdAt',
    'updatedAt'
  ] as const,
  
  // Context-based (universal keys)
  list: [
    'id',
    'firstName',
    'lastName',
    'companyName',
    'subscriptionStatus',
    'subscriptionPlan',
    'createdAt'
  ] as const,
  
  card: [
    'id',
    'firstName', 
    'lastName', 
    'companyName',
    'avatarUrl',
    'subscriptionStatus'
  ] as const,
  
  detail: [
    'id',
    'firstName', 
    'lastName', 
    'companyName',
    'email', 
    'phone',
    'timezone',
    'avatarUrl',
    'subscriptionStatus',
    'subscriptionPlan',
    'maxHomes',
    'onboardingCompleted',
    'communicationPreferences'
  ] as const,
  
  form: [
    'id',
    'firstName', 
    'lastName', 
    'companyName',
    'email', 
    'phone',
    'timezone',
    'avatarUrl',
    'subscriptionStatus',
    'subscriptionPlan',
    'maxHomes',
    'billingAddress',
    'settings',
    'communicationPreferences'
  ] as const,
  
  // Role-based (universal keys)
  admin: [
    'id',
    'firstName',
    'lastName',
    'companyName', 
    'slug',
    'email',
    'phone',
    'subscriptionStatus',
    'subscriptionPlan',
    'maxHomes',
    'stripeCustomerId',
    'supportPriority',
    'paymentFailedCount',
    'onboardingCompleted',
    'createdAt',
    'updatedAt'
  ] as const,
  
  public: [
    'id', 
    'firstName', 
    'lastName',
    'companyName'
  ] as const
} as const;

// ============================================
// TYPES
// ============================================
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

// Field set types
export type CustomerMinimal = Pick<Customer, typeof CustomerFieldSets.minimal[number]>;
export type CustomerLite = Pick<Customer, typeof CustomerFieldSets.lite[number]>;
export type CustomerDefault = Pick<Customer, typeof CustomerFieldSets.default[number]>;
export type CustomerFull = Pick<Customer, typeof CustomerFieldSets.full[number]>;
export type CustomerList = Pick<Customer, typeof CustomerFieldSets.list[number]>;
export type CustomerCard = Pick<Customer, typeof CustomerFieldSets.card[number]>;
export type CustomerDetail = Pick<Customer, typeof CustomerFieldSets.detail[number]>;
export type CustomerForm = Pick<Customer, typeof CustomerFieldSets.form[number]>;
export type CustomerAdmin = Pick<Customer, typeof CustomerFieldSets.admin[number]>;
export type CustomerPublic = Pick<Customer, typeof CustomerFieldSets.public[number]>;

// Helper type for any field set
export type CustomerFieldSet = keyof typeof CustomerFieldSets;

// API-friendly type (camelCase)
export type CustomerAPI = {
  id: number;
  firstName: string;
  lastName: string;
  companyName?: string | null;
  slug: string;
  email?: string | null;
  phone?: string | null;
  subscriptionStatus: 'active' | 'pending' | 'cancelled' | 'suspended' | 'trial';
  subscriptionPlan?: string | null;
  maxHomes: number;
  stripeCustomerId?: string | null;
  timezone: string;
  avatarUrl?: string | null;
  onboardingCompleted: boolean;
  trialEndsAt?: Date | null;
  subscriptionStartsAt?: Date | null;
  lastPaymentDate?: Date | null;
  paymentFailedCount: number;
  supportPriority: 'low' | 'standard' | 'high' | 'enterprise';
  billingAddress?: any;
  settings?: any;
  communicationPreferences?: any;
  createdAt: Date;
  updatedAt: Date;
};
