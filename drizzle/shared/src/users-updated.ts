/**
 * Updated Users Schema for NextAuth Integration
 */
import { 
  pgTable, 
  serial, 
  integer,
  varchar, 
  boolean, 
  timestamp,
  index
} from 'drizzle-orm/pg-core';
import { customers } from './customers-updated.js';

// ============================================
// USERS TABLE - NEXTAUTH OPTIMIZED
// ============================================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  
  // NextAuth expected fields
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('emailVerified'), // NextAuth manages this
  image: varchar('image', { length: 500 }), // Profile image URL from OAuth or custom
  
  // Business logic fields
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  
  // Role and permissions
  role: varchar('role', { length: 20 }).default('viewer').$type<'admin' | 'manager' | 'staff' | 'cleaner' | 'viewer'>(),
  
  // Profile fields
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  
  // Account management
  isActive: boolean('is_active').default(true),
  lastLogin: timestamp('last_login'),
  
  // Optional: Keep password hash for credentials provider (if using both OAuth + credentials)
  passwordHash: varchar('password_hash', { length: 255 }),
  
  // Audit fields
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  customerIdx: index('idx_users_customer').on(table.customerId),
  emailIdx: index('idx_users_email').on(table.email),
  activeIdx: index('idx_users_active').on(table.isActive),
  roleIdx: index('idx_users_role').on(table.role),
}));

// ============================================
// NEXTAUTH REQUIRED TABLES
// ============================================

// Accounts table - OAuth provider accounts
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('providerAccountId', { length: 255 }).notNull(),
  refresh_token: varchar('refresh_token', { length: 500 }),
  access_token: varchar('access_token', { length: 500 }),
  expires_at: integer('expires_at'),
  token_type: varchar('token_type', { length: 255 }),
  scope: varchar('scope', { length: 255 }),
  id_token: varchar('id_token', { length: 2048 }),
  session_state: varchar('session_state', { length: 255 }),
}, (table) => ({
  userIdx: index('idx_accounts_user').on(table.userId),
  providerIdx: index('idx_accounts_provider').on(table.provider, table.providerAccountId),
}));

// Sessions table - user sessions
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionToken: varchar('sessionToken', { length: 255 }).notNull().unique(),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  userIdx: index('idx_sessions_user').on(table.userId),
  tokenIdx: index('idx_sessions_token').on(table.sessionToken),
}));

// Verification tokens table - email verification, password reset
export const verificationTokens = pgTable('verification_tokens', {
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  identifierIdx: index('idx_verification_identifier').on(table.identifier),
  tokenIdx: index('idx_verification_token').on(table.token),
}));

// ============================================
// STANDARDIZED FIELD SETS
// ============================================
export const UserFieldSets = {
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
    'email',
    'role'
  ] as const,
  
  default: [
    'id', 
    'firstName', 
    'lastName', 
    'email',
    'image',
    'customerId',
    'role',
    'timezone',
    'isActive'
  ] as const,
  
  full: [
    'id',
    'email',
    'emailVerified',
    'image',
    'customerId',
    'firstName',
    'lastName',
    'phone',
    'role',
    'timezone',
    'onboardingCompleted',
    'isActive',
    'lastLogin',
    'createdAt',
    'updatedAt'
  ] as const,
  
  // Context-based (universal keys)
  list: [
    'id',
    'firstName',
    'lastName',
    'email',
    'role',
    'isActive',
    'lastLogin'
  ] as const,
  
  card: [
    'id', 
    'firstName', 
    'lastName',
    'image',
    'role',
    'isActive'
  ] as const,
  
  detail: [
    'id',
    'firstName', 
    'lastName', 
    'email',
    'image',
    'phone',
    'role',
    'timezone',
    'onboardingCompleted',
    'lastLogin'
  ] as const,
  
  form: [
    'id',
    'firstName', 
    'lastName', 
    'email',
    'image',
    'phone',
    'role',
    'timezone',
    'isActive'
  ] as const,
  
  // Role-based (universal keys)
  admin: [
    'id',
    'email',
    'emailVerified',
    'customerId',
    'firstName',
    'lastName',
    'phone',
    'role',
    'isActive',
    'lastLogin',
    'createdAt',
    'updatedAt'
  ] as const,
  
  public: [
    'id', 
    'firstName', 
    'lastName'
  ] as const
} as const;

// ============================================
// TYPES
// ============================================
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

// Field set types
export type UserMinimal = Pick<User, typeof UserFieldSets.minimal[number]>;
export type UserLite = Pick<User, typeof UserFieldSets.lite[number]>;
export type UserDefault = Pick<User, typeof UserFieldSets.default[number]>;
export type UserFull = Pick<User, typeof UserFieldSets.full[number]>;
export type UserList = Pick<User, typeof UserFieldSets.list[number]>;
export type UserCard = Pick<User, typeof UserFieldSets.card[number]>;
export type UserDetail = Pick<User, typeof UserFieldSets.detail[number]>;
export type UserForm = Pick<User, typeof UserFieldSets.form[number]>;
export type UserAdmin = Pick<User, typeof UserFieldSets.admin[number]>;
export type UserPublic = Pick<User, typeof UserFieldSets.public[number]>;

// Helper type for any field set
export type UserFieldSet = keyof typeof UserFieldSets;

// API-friendly type (camelCase)
export type UserAPI = {
  id: number;
  email: string;
  emailVerified?: Date | null;
  image?: string | null;
  customerId?: number | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: 'admin' | 'manager' | 'staff' | 'cleaner' | 'viewer';
  timezone: string;
  onboardingCompleted: boolean;
  isActive: boolean;
  lastLogin?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
