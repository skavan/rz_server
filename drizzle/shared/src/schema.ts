import { 
  pgTable, 
  serial, 
  integer, 
  varchar, 
  text, 
  boolean, 
  timestamp, 
  date, 
  decimal,
  unique,
  index,
  jsonb,
  pgEnum
} from 'drizzle-orm/pg-core';

// ============================================
// AUTHENTICATION TABLES (NextAuth.js compatible)
// ============================================

export const verificationTokens = pgTable('verification_tokens', {
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (table) => ({
  identifierIdx: index('idx_verification_identifier').on(table.identifier),
  tokenIdx: index('idx_verification_token').on(table.token),
}));

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  // DB column for user is currently camel-case in DB (userId); keep as-is
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('providerAccountId', { length: 255 }).notNull(),
  // Token fields: camelCase props mapped to snake_case columns
  refreshToken: varchar('refresh_token', { length: 500 }),
  accessToken: varchar('access_token', { length: 500 }),
  expiresAt: integer('expires_at'),
  tokenType: varchar('token_type', { length: 255 }),
  scope: varchar('scope', { length: 255 }),
  idToken: varchar('id_token', { length: 2048 }),
  sessionState: varchar('session_state', { length: 255 }),
}, (table) => ({
  userIdx: index('idx_accounts_user').on(table.userId),
  providerIdx: index('idx_accounts_provider').on(table.provider, table.providerAccountId),
}));

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionToken: varchar('sessionToken', { length: 255 }).notNull().unique(),
  userId: integer('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (table) => ({
  userIdx: index('idx_sessions_user').on(table.userId),
  tokenIdx: index('idx_sessions_token').on(table.sessionToken),
}));

// ============================================
// CUSTOMERS TABLE
// ============================================
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }).default('active').$type<'active' | 'pending' | 'cancelled' | 'suspended'>(),
  subscriptionPlan: varchar('subscription_plan', { length: 50 }),
  maxHomes: integer('max_homes').default(5),
  billingAddress: jsonb('billing_address'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeData: jsonb('stripe_data'),
  timezone: varchar('timezone', { length: 64 }),
  avatarUrl: varchar('avatar_url', { length: 512 }),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  subscriptionStartsAt: timestamp('subscription_starts_at', { withTimezone: true }),
  lastPaymentDate: timestamp('last_payment_date', { withTimezone: true }),
  paymentFailedCount: integer('payment_failed_count').default(0),
  supportPriority: varchar('support_priority', { length: 20 }),
  settings: jsonb('settings'),
  communicationPreferences: jsonb('communication_preferences'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('idx_customers_status').on(table.subscriptionStatus),
  slugIdx: index('idx_customers_slug').on(table.slug),
}));

// ============================================
// USERS TABLE
// ============================================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: varchar('image', { length: 512 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: varchar('role', { length: 20 }).default('user').$type<'admin' | 'manager' | 'user' | 'cleaner'>(),
  timezone: varchar('timezone', { length: 64 }),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  isActive: boolean('is_active').default(true),
  // Optional: bump to force JWT revalidation/reauth
  sessionVersion: integer('session_version').default(0),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_users_customer').on(table.customerId),
  emailIdx: index('idx_users_email').on(table.email),
  activeIdx: index('idx_users_active').on(table.isActive),
}));

// ============================================
// HOMES TABLE
// ============================================
export const homes = pgTable('homes', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  address: jsonb('address'),
  propertyType: varchar('property_type', { length: 50 }),
  bedrooms: integer('bedrooms'),
  bathrooms: decimal('bathrooms', { precision: 3, scale: 1 }),
  squareFootage: integer('square_footage'),
  description: text('description'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('homes_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_homes_customer').on(table.customerId),
  activeIdx: index('idx_homes_active').on(table.isActive),
  typeIdx: index('idx_homes_type').on(table.propertyType),
}));

// ============================================
// USER HOME ACCESS TABLE
// ============================================
export const userHomeAccess = pgTable('user_home_access', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).default('viewer').$type<'admin' | 'manager' | 'viewer'>(),
  grantedBy: integer('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserHome: unique('user_home_access_user_home_unique').on(table.userId, table.homeId),
  userIdx: index('idx_user_home_access_user').on(table.userId),
  homeIdx: index('idx_user_home_access_home').on(table.homeId),
}));

// ============================================
// USER INVITES TABLE (approval-based onboarding)
// ============================================
export const userInvites = pgTable('user_invites', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }), // optional, invite to a specific home
  role: varchar('role', { length: 20 }).default('viewer').$type<'admin' | 'manager' | 'viewer'>(),
  // Invite lifecycle
  status: varchar('status', { length: 20 }).default('pending').$type<'pending' | 'approved' | 'accepted' | 'revoked' | 'expired'>(),
  invitedBy: integer('invited_by').references(() => users.id),
  invitedAt: timestamp('invited_at', { withTimezone: true }).defaultNow(),
  approvedBy: integer('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  // Reserved for future magic-link/claim flows (not enabled now)
  inviteToken: varchar('invite_token', { length: 255 }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index('idx_user_invites_email').on(table.email),
  customerIdx: index('idx_user_invites_customer').on(table.customerId),
  homeIdx: index('idx_user_invites_home').on(table.homeId),
  statusIdx: index('idx_user_invites_status').on(table.status),
}));

// ============================================
// CATEGORIES TABLE
// ============================================
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  parentId: integer('parent_id'), // Self-reference will be added after table definition
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('categories_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_categories_customer').on(table.customerId),
  parentIdx: index('idx_categories_parent').on(table.parentId),
  activeIdx: index('idx_categories_active').on(table.isActive),
}));

// ============================================
// BRANDS TABLE
// ============================================
export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  websiteUrl: varchar('website_url', { length: 500 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('brands_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_brands_customer').on(table.customerId),
  activeIdx: index('idx_brands_active').on(table.isActive),
}));

// ============================================
// VENDORS TABLE
// ============================================
export const vendors = pgTable('vendors', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  websiteUrl: varchar('website_url', { length: 500 }),
  paymentTerms: varchar('payment_terms', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('vendors_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_vendors_customer').on(table.customerId),
  activeIdx: index('idx_vendors_active').on(table.isActive),
}));

// ============================================
// TAGS TABLE
// ============================================
// Tag enums for classification and scoping
export const tagTypeEnum = pgEnum('tag_type', ['category', 'status', 'feature', 'material', 'project']);
export const tagScopeEnum = pgEnum('tag_scope', ['product', 'sku', 'inventory_item', 'location', 'home', 'all']);

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }), // Hex color code
  tagType: tagTypeEnum('tag_type'),
  tagScope: tagScopeEnum('tag_scope'),
  isSystem: boolean('is_system').default(false),
  locked: boolean('locked').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('tags_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_tags_customer').on(table.customerId),
  activeIdx: index('idx_tags_active').on(table.isActive),
}));

// ============================================
// PRODUCTS TABLE
// ============================================
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  kind: varchar('kind', { length: 20 }).default('simple').$type<'simple' | 'bom'>(),
  checkCadence: jsonb('check_cadence'),
  tags: integer('tags').array(),
  notes: text('notes'),
  hasMediaAssets: boolean('has_media_assets').default(false),
  isVisible: boolean('is_visible').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('products_home_slug_unique').on(table.homeId, table.slug),
  homeIdx: index('idx_products_home').on(table.homeId),
  categoryIdx: index('idx_products_category').on(table.categoryId),
  kindIdx: index('idx_products_kind').on(table.kind),
  visibleIdx: index('idx_products_visible').on(table.isVisible),
  mediaIdx: index('idx_products_has_media').on(table.hasMediaAssets),
  activeIdx: index('idx_products_active').on(table.isActive),
  // Note: GIN indexes for tags and check_cadence will be added in migration
}));

// ============================================
// SKUS TABLE
// ============================================
export const skus = pgTable('skus', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  brandId: integer('brand_id').references(() => brands.id),
  vendorId: integer('vendor_id').references(() => vendors.id),
  vendorSku: varchar('vendor_sku', { length: 100 }),
  purchaseUrl: text('purchase_url'),
  kind: varchar('kind', { length: 20 }).default('simple').$type<'simple' | 'bom'>(),
  price: decimal('price', { precision: 10, scale: 2 }),
  priceUpdated: timestamp('price_updated', { withTimezone: true }),
  isPurchasable: boolean('is_purchasable').default(true),
  currency: varchar('currency', { length: 3 }).default('USD'),
  lifespanYears: integer('lifespan_years'),
  tags: integer('tags').array(),
  notes: text('notes'),
  hasMediaAssets: boolean('has_media_assets').default(false),
  status: varchar('status', { length: 20 }).default('active').$type<'active' | 'discontinued' | 'unknown'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('skus_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_skus_customer').on(table.customerId),
  productIdx: index('idx_skus_product').on(table.productId),
  brandIdx: index('idx_skus_brand').on(table.brandId),
  vendorIdx: index('idx_skus_vendor').on(table.vendorId),
  kindIdx: index('idx_skus_kind').on(table.kind),
  statusIdx: index('idx_skus_status').on(table.status),
  mediaIdx: index('idx_skus_has_media').on(table.hasMediaAssets),
  // Note: GIN index for tags will be added in migration
}));

// ============================================
// LOCATIONS TABLE
// ============================================
export const locations = pgTable('locations', {
  id: serial('id').primaryKey(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  locationType: varchar('location_type', { length: 50 }),
  // Parent-child relationship for rooms (e.g., Bathroom belongs to Bedroom)
  parentId: integer('parent_id'),
  squareFootage: integer('square_footage'),
  lastCleaned: timestamp('last_cleaned', { withTimezone: true }),
  lastChecked: timestamp('last_checked', { withTimezone: true }),
  cleaningCadence: jsonb('cleaning_cadence'),
  checkingCadence: jsonb('checking_cadence'),
  tags: integer('tags').array(),
  notes: text('notes'),
  hasMediaAssets: boolean('has_media_assets').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('locations_home_slug_unique').on(table.homeId, table.slug),
  homeIdx: index('idx_locations_home').on(table.homeId),
  typeIdx: index('idx_locations_type').on(table.locationType),
  parentIdx: index('idx_locations_parent').on(table.parentId),
  mediaIdx: index('idx_locations_has_media').on(table.hasMediaAssets),
  activeIdx: index('idx_locations_active').on(table.isActive),
  // Note: GIN indexes for tags, cleaning_cadence, checking_cadence will be added in migration
}));

// Inventory Items - Physical instances of SKUs in homes
// Based on NoSQL InventoryItem interface
export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').notNull(),
  homeId: integer('home_id').notNull(),
  skuId: integer('sku_id').notNull(),
  productId: integer('product_id').notNull(),
  
  // Item identification
  serialNumber: varchar('serial_number', { length: 100 }),
  assetTag: varchar('asset_tag', { length: 100 }),
  
  // Location and assignment
  locationId: integer('location_id'),
  status: varchar('status', { length: 20 }).default('unassigned').$type<'unassigned' | 'in_use' | 'in_storage' | 'damaged' | 'in_repair' | 'missing'>(),
  
  // Quantity and condition tracking
  quantity: integer('quantity').default(1),
  condition: varchar('condition', { length: 20 }).default('good').$type<'excellent' | 'good' | 'fair' | 'poor'>(),
  lastChecked: timestamp('last_checked', { withTimezone: true }),
  lastMaintained: timestamp('last_maintained', { withTimezone: true }),
  
  // Purchase and lifecycle
  purchaseDate: date('purchase_date'),
  purchasePrice: decimal('purchase_price', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 3 }).default('USD'),
  warrantyExpires: date('warranty_expires'),
  expectedReplacement: date('expected_replacement'),
  
  // Kit/component handling
  parentItemId: integer('parent_item_id'),
  isKitComponent: boolean('is_kit_component').default(false),
  
  // Media assets
  hasMediaAssets: boolean('has_media_assets').default(false),
  
  // Tagging and notes
  tags: integer('tags').array(),
  notes: text('notes'),
  
  // Status
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Unique constraints
  uniqueAssetTag: unique('inventory_items_home_asset_tag_unique').on(table.homeId, table.assetTag),
  
  // Indexes
  customerIdx: index('idx_inventory_customer').on(table.customerId),
  homeIdx: index('idx_inventory_home').on(table.homeId),
  skuIdx: index('idx_inventory_sku').on(table.skuId),
  productIdx: index('idx_inventory_product').on(table.productId),
  locationIdx: index('idx_inventory_location').on(table.locationId),
  statusIdx: index('idx_inventory_status').on(table.status),
  quantityIdx: index('idx_inventory_quantity').on(table.quantity),
  conditionIdx: index('idx_inventory_condition').on(table.condition),
  parentIdx: index('idx_inventory_parent').on(table.parentItemId),
  kitComponentIdx: index('idx_inventory_kit_component').on(table.isKitComponent),
  activeIdx: index('idx_inventory_active').on(table.isActive),
  mediaIdx: index('idx_inventory_has_media').on(table.hasMediaAssets),
  // Note: GIN index for tags array will be added in migration
}));

// ============================================
// PRODUCT COMPONENTS TABLE
// ============================================
export const productComponents = pgTable('product_components', {
  id: serial('id').primaryKey(),
  parentProductId: integer('parent_product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  componentProductId: integer('component_product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  isRequired: boolean('is_required').default(true),
  sortOrder: integer('sort_order').default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  parentIdx: index('idx_product_components_parent').on(table.parentProductId),
  componentIdx: index('idx_product_components_component').on(table.componentProductId),
  requiredIdx: index('idx_product_components_required').on(table.isRequired),
  sortIdx: index('idx_product_components_sort').on(table.parentProductId, table.sortOrder),
  uniqueComponent: unique().on(table.parentProductId, table.componentProductId),
}));

// ============================================
// SKU COMPONENTS TABLE
// ============================================
export const skuComponents = pgTable('sku_components', {
  id: serial('id').primaryKey(),
  parentSkuId: integer('parent_sku_id').references(() => skus.id, { onDelete: 'cascade' }).notNull(),
  componentSkuId: integer('component_sku_id').references(() => skus.id, { onDelete: 'cascade' }).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  isRequired: boolean('is_required').default(true),
  sortOrder: integer('sort_order').default(0),
  costAllocation: decimal('cost_allocation', { precision: 5, scale: 4 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  parentIdx: index('idx_sku_components_parent').on(table.parentSkuId),
  componentIdx: index('idx_sku_components_component').on(table.componentSkuId),
  requiredIdx: index('idx_sku_components_required').on(table.isRequired),
  sortIdx: index('idx_sku_components_sort').on(table.parentSkuId, table.sortOrder),
  uniqueComponent: unique().on(table.parentSkuId, table.componentSkuId),
}));

// ============================================
// MEDIA ASSETS TABLE
// ============================================
export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull().$type<'product' | 'sku' | 'inventory_item' | 'room' | 'home'>(),
  entityId: integer('entity_id').notNull(),
  url: text('url').notNull(),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  fileName: varchar('file_name', { length: 255 }),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  assetType: varchar('asset_type', { length: 20 }).default('image').$type<'image' | 'document' | 'video' | 'link'>(),
  isPrimary: boolean('is_primary').default(false),
  sortOrder: integer('sort_order').default(0),
  tags: jsonb('tags').$type<number[] | null>(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_media_assets_customer').on(table.customerId),
  entityIdx: index('idx_media_assets_entity').on(table.entityType, table.entityId),
  typeIdx: index('idx_media_assets_type').on(table.assetType),
  activeIdx: index('idx_media_assets_active').on(table.isActive),
  tagsIdx: index('idx_media_assets_tags_gin').on(table.tags),
  sortIdx: index('idx_media_assets_sort').on(table.entityType, table.entityId, table.sortOrder),
  primaryUnique: unique().on(table.entityType, table.entityId, table.isPrimary),
}));

// ============================================
// INFERRED TYPES
// ============================================

// Database types (snake_case)
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserInvite = typeof userInvites.$inferSelect;
export type NewUserInvite = typeof userInvites.$inferInsert;

export type Home = typeof homes.$inferSelect;
export type NewHome = typeof homes.$inferInsert;

export type UserHomeAccess = typeof userHomeAccess.$inferSelect;
export type NewUserHomeAccess = typeof userHomeAccess.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Brand = typeof brands.$inferSelect;
export type NewBrand = typeof brands.$inferInsert;

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Sku = typeof skus.$inferSelect;
export type NewSku = typeof skus.$inferInsert;

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;

export type ProductComponent = typeof productComponents.$inferSelect;
export type NewProductComponent = typeof productComponents.$inferInsert;

export type SkuComponent = typeof skuComponents.$inferSelect;
export type NewSkuComponent = typeof skuComponents.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

// API-friendly types (camelCase) - for client consumption
export type CustomerAPI = {
  id: number;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  subscriptionStatus: 'active' | 'pending' | 'cancelled' | 'suspended';
  subscriptionPlan?: string | null;
  maxHomes: number;
  billingAddress?: any;
  createdAt: Date;
  updatedAt: Date;
};

// Optional: Location API shape (add when needed by client)
export type LocationAPI = {
  id: number;
  homeId: number | null;
  name: string;
  slug: string;
  description?: string | null;
  locationType?: string | null;
  parentId?: number | null;
  squareFootage?: number | null;
  lastCleaned?: Date | null;
  lastChecked?: Date | null;
  cleaningCadence?: any;
  checkingCadence?: any;
  tags?: number[] | null;
  notes?: string | null;
  hasMediaAssets: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryItemAPI = {
  id: number;
  customerId: number;
  homeId: number;
  skuId: number;
  productId: number;
  serialNumber?: string | null;
  assetTag?: string | null;
  locationId?: number | null;
  status: 'unassigned' | 'in_use' | 'in_storage' | 'damaged' | 'in_repair' | 'missing';
  quantity: number;
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  lastChecked?: Date | null;
  lastMaintained?: Date | null;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  warrantyExpires?: string | null;
  expectedReplacement?: string | null;
  parentItemId?: number | null;
  isKitComponent: boolean;
  hasMediaAssets: boolean;
  tags?: number[] | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ... Add more API types as needed
