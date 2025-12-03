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
  
  // Brand category associations - null means serves all categories
  categoryIds: integer('category_ids').array(),
  
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
// LOCATION TYPES TABLE
// ============================================
export const locationTypes = pgTable('location_types', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  hasMediaAssets: boolean('has_media_assets').default(false),
  icon: varchar('icon', { length: 255 }),
  sortOrder: integer('sort_order'),
  isVisible: boolean('is_visible').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('location_types_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_location_types_customer').on(table.customerId),
  sortIdx: index('idx_location_types_sort').on(table.sortOrder),
  activeIdx: index('idx_location_types_active').on(table.isActive),
}));

// ============================================
// TAGS TABLE
// ============================================
// Tag enums for classification and scoping
export const tagTypeEnum = pgEnum('tag_type', ['placeholder']); // Reserved for future use
export const tagScopeEnum = pgEnum('tag_scope', ['product', 'sku', 'inventory_item', 'location', 'home', 'all']);

export const issueStatusEnum = pgEnum('issue_status', ['open', 'in_progress', 'resolved', 'dismissed']);
export const issueUrgencyEnum = pgEnum('issue_urgency', ['normal', 'high']);
export const issueTypeEnum = pgEnum('issue_type', ['operational', 'cosmetic', 'safety', 'supplies']);
export const issueActionEnum = pgEnum('issue_recommended_action', ['none', 'repair', 'replace', 'inspect']);
export const issueDamageAssessmentEnum = pgEnum('issue_damage_assessment', ['none', 'minor', 'major']);
export const issueResolutionEnum = pgEnum('issue_resolution_type', ['monitor', 'repair', 'replace', 'claim']);
export const inventoryActionTypeEnum = pgEnum('inventory_action_type', ['replace', 'repair', 'claim']);
export const inventoryActionProcurementStatusEnum = pgEnum('inventory_action_procurement_status', ['pending', 'in_review', 'ready_for_order', 'queued_for_po', 'ordered', 'fulfilled', 'canceled']);
export const inventoryActionRepairStatusEnum = pgEnum('inventory_action_repair_status', ['not_applicable', 'pending', 'awaiting_vendor', 'in_service', 'completed', 'canceled']);
export const purchaseOrderStatusEnum = pgEnum('inventory_purchase_order_status', ['draft', 'pending_vendor', 'ordered', 'receiving', 'closed', 'canceled']);
export const shippingChargeTypeEnum = pgEnum('shipping_charge_type', ['percent', 'fixed']);

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 7 }), // Hex color code
  
  // Category association - null means applies to all categories within scope
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  
  // Tag scope - which table(s) can use this tag
  tagScope: tagScopeEnum('tag_scope'),
  
  // Reserved for future use
  tagType: tagTypeEnum('tag_type'),
  
  isSystem: boolean('is_system').default(false),
  locked: boolean('locked').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueSlug: unique('tags_customer_slug_unique').on(table.customerId, table.slug),
  customerIdx: index('idx_tags_customer').on(table.customerId),
  categoryIdx: index('idx_tags_category').on(table.categoryId),
  scopeIdx: index('idx_tags_scope').on(table.tagScope),
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
  locationTypeId: integer('location_type_id').references(() => locationTypes.id),
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
  typeIdx: index('idx_locations_type').on(table.locationTypeId),
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
  sublocation: text('sublocation'),
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
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }),
  entityType: varchar('entity_type', { length: 20 }).notNull().$type<'product' | 'sku' | 'inventory_item' | 'location' | 'home' | 'issue' | 'location_type'>(),
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
  homeIdx: index('idx_media_assets_home').on(table.homeId),
  typeIdx: index('idx_media_assets_type').on(table.assetType),
  activeIdx: index('idx_media_assets_active').on(table.isActive),
  tagsIdx: index('idx_media_assets_tags_gin').on(table.tags),
  sortIdx: index('idx_media_assets_sort').on(table.entityType, table.entityId, table.sortOrder),
}));

export const issues = pgTable('issues', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'set null' }),
  entityType: varchar('entity_type', { length: 30 }).notNull().$type<'inventory_item' | 'location' | 'home' | 'product' | 'sku'>(),
  entityId: integer('entity_id').notNull(),
  status: issueStatusEnum('status').default('open').notNull(),
  urgency: issueUrgencyEnum('urgency').default('normal').notNull(),
  issueType: issueTypeEnum('issue_type').default('operational').notNull(),
  description: text('description').notNull(),
  recommendedAction: issueActionEnum('recommended_action').default('none').notNull(),
  hasVisibleDamage: boolean('has_visible_damage').default(false).notNull(),
  damageAssessment: issueDamageAssessmentEnum('damage_assessment').default('none').notNull(),
  resolutionType: issueResolutionEnum('resolution_type').default('monitor').notNull(),
  requiresPurchase: boolean('requires_purchase').default(false).notNull(),
  actionRequestId: integer('action_request_id'),
  estimatedClaimAmount: decimal('estimated_claim_amount', { precision: 12, scale: 2 }),
  insurancePolicyRef: varchar('insurance_policy_ref', { length: 100 }),
  insuranceClaimRef: varchar('insurance_claim_ref', { length: 100 }),
  reportedByUserId: integer('reported_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow().notNull(),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  resolvedByUserId: integer('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionNote: text('resolution_note'),
  tags: integer('tags').array(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedByUserId: integer('deleted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_issues_customer').on(table.customerId),
  homeIdx: index('idx_issues_home').on(table.homeId),
  entityIdx: index('idx_issues_entity').on(table.entityType, table.entityId),
  statusIdx: index('idx_issues_status').on(table.status),
  urgencyIdx: index('idx_issues_urgency').on(table.urgency),
  assigneeIdx: index('idx_issues_assignee').on(table.assignedToUserId),
  deletedIdx: index('idx_issues_deleted_at').on(table.deletedAt),
  actionRequestIdx: index('idx_issues_action_request').on(table.actionRequestId),
}));

// ============================================
// INVENTORY PURCHASE ORDERS TABLE
// ============================================
export const inventoryPurchaseOrders = pgTable('inventory_purchase_orders', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  vendorId: integer('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  purchaseNumber: varchar('purchase_number', { length: 64 }).notNull(),
  status: purchaseOrderStatusEnum('status').default('draft').notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  totalAmount: decimal('total_amount', { precision: 14, scale: 2 }).default('0').notNull(),
  shippingAmount: decimal('shipping_amount', { precision: 14, scale: 2 }).default('0').notNull(),
  taxAmount: decimal('tax_amount', { precision: 14, scale: 2 }).default('0').notNull(),
  currency: varchar('currency', { length: 10 }).default('USD').notNull(),
  notes: text('notes'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_purchase_orders_customer').on(table.customerId),
  vendorIdx: index('idx_purchase_orders_vendor').on(table.vendorId),
  numberIdx: index('idx_purchase_orders_number').on(table.purchaseNumber),
  statusIdx: index('idx_purchase_orders_status').on(table.status),
  assigneeIdx: index('idx_purchase_orders_assignee').on(table.assignedToUserId),
  uniqueCustomerNumber: unique('inventory_purchase_orders_customer_number_unique').on(table.customerId, table.purchaseNumber),
}));

// ============================================
// INVENTORY ACTION REQUESTS TABLE
// ============================================
export const inventoryActionRequests = pgTable('inventory_action_requests', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  issueId: integer('issue_id').references(() => issues.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'set null' }),
  inventoryItemId: integer('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  currentSkuId: integer('current_sku_id').references(() => skus.id, { onDelete: 'set null' }),
  replacementSkuId: integer('replacement_sku_id').references(() => skus.id, { onDelete: 'set null' }),
  actionType: inventoryActionTypeEnum('action_type').default('replace').notNull(),
  procurementStatus: inventoryActionProcurementStatusEnum('procurement_status').default('pending').notNull(),
  repairStatus: inventoryActionRepairStatusEnum('repair_status').default('not_applicable').notNull(),
  requestedQuantity: integer('requested_quantity').default(1).notNull(),
  fieldNotes: text('field_notes'),
  internalNotes: text('internal_notes'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  assignedToUserId: integer('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
  decisionByUserId: integer('decision_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  decisionMadeAt: timestamp('decision_made_at', { withTimezone: true }),
  preferredVendorId: integer('preferred_vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  vendorNotes: text('vendor_notes'),
  unitPriceEstimate: decimal('unit_price_estimate', { precision: 14, scale: 2 }),
  claimAmount: decimal('claim_amount', { precision: 14, scale: 2 }),
  isClaimEstimate: boolean('is_claim_estimate').default(true).notNull(),
  isInsuranceClaim: boolean('is_insurance_claim').default(false).notNull(),
  shippingChargeType: shippingChargeTypeEnum('shipping_charge_type'),
  shippingChargeValue: decimal('shipping_charge_value', { precision: 14, scale: 2 }),
  leadTimeDays: integer('lead_time_days'),
  shippingTimeDays: integer('shipping_time_days'),
  etaDate: date('eta_date'),
  currentPurchaseOrderId: integer('current_purchase_order_id').references(() => inventoryPurchaseOrders.id, { onDelete: 'set null' }),
  queuedForPoAt: timestamp('queued_for_po_at', { withTimezone: true }),
  orderedAt: timestamp('ordered_at', { withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  metadata: jsonb('metadata'),
  actionContext: jsonb('action_context'),
  lastWorkflowTouchedAt: timestamp('last_workflow_touched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_action_requests_customer').on(table.customerId),
  issueIdx: index('idx_action_requests_issue').on(table.issueId),
  homeIdx: index('idx_action_requests_home').on(table.homeId),
  inventoryIdx: index('idx_action_requests_inventory').on(table.inventoryItemId),
  procurementStatusIdx: index('idx_action_requests_procurement_status').on(table.procurementStatus),
  repairStatusIdx: index('idx_action_requests_repair_status').on(table.repairStatus),
  vendorIdx: index('idx_action_requests_vendor_pref').on(table.preferredVendorId),
  purchaseOrderIdx: index('idx_action_requests_po').on(table.currentPurchaseOrderId),
  assigneeIdx: index('idx_action_requests_assignee').on(table.assignedToUserId),
  typeIdx: index('idx_action_requests_type').on(table.actionType),
}));

// ============================================
// INVENTORY PURCHASE ORDER ITEMS TABLE
// ============================================
export const inventoryPurchaseOrderItems = pgTable('inventory_purchase_order_items', {
  id: serial('id').primaryKey(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  purchaseOrderId: integer('purchase_order_id').references(() => inventoryPurchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  actionRequestId: integer('action_request_id').references(() => inventoryActionRequests.id, { onDelete: 'set null' }),
  skuId: integer('sku_id').references(() => skus.id, { onDelete: 'set null' }),
  description: text('description'),
  orderedQuantity: integer('ordered_quantity').default(1).notNull(),
  receivedQuantity: integer('received_quantity').default(0).notNull(),
  unitPriceSnapshot: decimal('unit_price_snapshot', { precision: 14, scale: 2 }),
  extendedPrice: decimal('extended_price', { precision: 14, scale: 2 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_purchase_order_items_customer').on(table.customerId),
  purchaseOrderIdx: index('idx_purchase_order_items_po').on(table.purchaseOrderId),
  actionRequestIdx: index('idx_purchase_order_items_action_request').on(table.actionRequestId),
  skuIdx: index('idx_purchase_order_items_sku').on(table.skuId),
}));

// ============================================
// CRM CONTACTS TABLE
// ============================================
export const crmContacts = pgTable('crm_contacts', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  secondaryPhone: varchar('secondary_phone', { length: 50 }),
  secondaryEmail: varchar('secondary_email', { length: 255 }),
  address: jsonb('address'),
  dateOfBirth: varchar('date_of_birth', { length: 20 }),
  placeOfBirth: varchar('place_of_birth', { length: 255 }),
  fiscalCode: varchar('fiscal_code', { length: 100 }),
  phoneCountryCode: varchar('phone_country_code', { length: 10 }),
  occupation: varchar('occupation', { length: 255 }),
  jobTitle: varchar('job_title', { length: 255 }),
  companyName: varchar('company_name', { length: 255 }),
  websiteUrl: varchar('website_url', { length: 255 }),
  guestPartyId: integer('guest_party_id'),
  guestPartyRole: varchar('guest_party_role', { length: 100 }),
  ageAtBooking: integer('age_at_booking'),
  preferences: jsonb('preferences'),
  emergencyContacts: jsonb('emergency_contacts'),
  relationships: jsonb('relationships'),
  communicationPreferences: jsonb('communication_preferences'),
  status: varchar('status', { length: 50 }),
  tags: text('tags').array(),
  isPrimary: boolean('is_primary'),
  isMultipleTransactions: boolean('is_multiple_transactions'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  tenantIdx: index('idx_crm_contacts_tenant').on(table.tenantId),
}));

// ============================================
// CRM LEAD SOURCES TABLE
// ============================================
export const crmLeadSources = pgTable('crm_lead_sources', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sourceType: varchar('source_type', { length: 50 }),
  defaultCommissionRate: decimal('default_commission_rate', { precision: 7, scale: 4 }),
  defaultCommissionType: varchar('default_commission_type', { length: 50 }),
  defaultCommissionAmount: decimal('default_commission_amount', { precision: 10, scale: 2 }),
  isActive: boolean('is_active'),
  sortOrder: integer('sort_order'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => ({
  tenantIdx: index('idx_crm_lead_sources_tenant').on(table.tenantId),
}));

// ============================================
// BOOKING RESERVATIONS TABLE
// ============================================
export const bookingReservations = pgTable('booking_reservations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }).notNull(),
  primaryGuestId: integer('primary_guest_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  guestPartyId: integer('guest_party_id'),
  externalId: varchar('external_id', { length: 255 }),
  confirmationCode: varchar('confirmation_code', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull(),
  bookingType: varchar('booking_type', { length: 50 }),
  checkIn: timestamp('check_in', { withTimezone: true }).notNull(),
  checkOut: timestamp('check_out', { withTimezone: true }).notNull(),
  nights: integer('nights').notNull(),
  adults: integer('adults').notNull(),
  children: integer('children').notNull(),
  pets: integer('pets').default(0),
  rent: decimal('rent', { precision: 10, scale: 2 }),
  taxes: decimal('taxes', { precision: 10, scale: 2 }),
  services: decimal('services', { precision: 10, scale: 2 }),
  discounts: decimal('discounts', { precision: 10, scale: 2 }),
  commissions: decimal('commissions', { precision: 10, scale: 2 }),
  expenses: decimal('expenses', { precision: 10, scale: 2 }),
  guestTotal: decimal('guest_total', { precision: 10, scale: 2 }),
  ownerTotal: decimal('owner_total', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 10 }),
  damageDeposit: decimal('damage_deposit', { precision: 10, scale: 2 }),
  fundsReceived: decimal('funds_received', { precision: 10, scale: 2 }),
  amountOutstanding: decimal('amount_outstanding', { precision: 10, scale: 2 }).notNull(),
  nextPaymentDueDate: timestamp('next_payment_due_date', { withTimezone: true }),
  leadSourceId: integer('lead_source_id').references(() => crmLeadSources.id, { onDelete: 'set null' }),
  bookingChannelId: integer('booking_channel_id'),
  isOwnerBooking: boolean('is_owner_booking'),
  isPriceOverridden: boolean('is_price_overridden'),
  overrideReason: text('override_reason'),
  housekeeperId: integer('housekeeper_id'),
  checkInManagerId: integer('check_in_manager_id'),
  conciergeId: integer('concierge_id'),
  language: varchar('language', { length: 20 }),
  specialRequests: text('special_requests'),
  lockboxCode: varchar('lockbox_code', { length: 100 }),
  wifiPassword: varchar('wifi_password', { length: 100 }),
  createdBy: integer('created_by').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  bedrooms: integer('bedrooms'),
  notes: text('notes'),
  tags: text('tags').array(),
}, (table) => ({
  tenantIdx: index('idx_booking_reservations_tenant').on(table.tenantId),
  homeIdx: index('idx_booking_reservations_home').on(table.homeId),
  primaryGuestIdx: index('idx_booking_reservations_primary_guest').on(table.primaryGuestId),
  leadSourceIdx: index('idx_booking_reservations_lead_source').on(table.leadSourceId),
  externalIdUnique: unique('booking_reservations_external_id_unique').on(table.externalId),
  confirmationCodeUnique: unique('booking_reservations_confirmation_code_unique').on(table.confirmationCode),
}));

// ============================================
// BOOKING FINANCIALS TABLE
// ============================================
export const bookingFinancials = pgTable('booking_financials', {
  id: serial('id').primaryKey(),
  reservationId: integer('reservation_id').references(() => bookingReservations.id, { onDelete: 'cascade' }).notNull(),
  rent: decimal('rent', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  taxes: jsonb('taxes'),
  services: jsonb('services'),
  discounts: jsonb('discounts'),
  taxTotal: decimal('tax_total', { precision: 10, scale: 2 }),
  serviceTotal: decimal('service_total', { precision: 10, scale: 2 }),
  discountTotal: decimal('discount_total', { precision: 10, scale: 2 }),
  grandTotal: decimal('grand_total', { precision: 10, scale: 2 }).notNull(),
  damageDeposit: decimal('damage_deposit', { precision: 10, scale: 2 }),
  channelFee: decimal('channel_fee', { precision: 10, scale: 2 }),
  minNightlyPrice: decimal('min_nightly_price', { precision: 10, scale: 2 }),
  maxNightlyPrice: decimal('max_nightly_price', { precision: 10, scale: 2 }),
  isPaid: boolean('is_paid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
}, (table) => ({
  reservationUnique: unique('booking_financials_reservation_id_unique').on(table.reservationId),
}));

// ============================================
// BOOKING NOTES TABLE
// ============================================
export const bookingNotes = pgTable('booking_notes', {
  id: serial('id').primaryKey(),
  reservationId: integer('reservation_id').references(() => bookingReservations.id, { onDelete: 'cascade' }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  noteType: varchar('note_type', { length: 50 }).notNull(),
  note: text('note').notNull(),
  guestName: varchar('guest_name', { length: 255 }),
  guestEmail: varchar('guest_email', { length: 255 }),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ============================================
// FINANCE COMMISSIONS TABLE
// ============================================
export const financeCommissions = pgTable('finance_commissions', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  reservationId: integer('reservation_id').references(() => bookingReservations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  leadSourceId: integer('lead_source_id').references(() => crmLeadSources.id, { onDelete: 'set null' }),
  agentId: integer('agent_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  agentName: varchar('agent_name', { length: 255 }),
  channelName: varchar('channel_name', { length: 255 }),
  isRateOverridden: boolean('is_rate_overridden'),
  originalRate: decimal('original_rate', { precision: 7, scale: 4 }),
  calculationType: varchar('calculation_type', { length: 50 }).notNull(),
  percentage: decimal('percentage', { precision: 7, scale: 4 }),
  fixedAmount: decimal('fixed_amount', { precision: 10, scale: 2 }),
  calculatedAmount: decimal('calculated_amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }),
  calculationBase: varchar('calculation_base', { length: 50 }),
  paymentStatus: varchar('payment_status', { length: 50 }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentMethod: varchar('payment_method', { length: 50 }),
  dueDate: timestamp('due_date', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
}, (table) => ({
  tenantIdx: index('idx_finance_commissions_tenant').on(table.tenantId),
  reservationIdx: index('idx_finance_commissions_reservation').on(table.reservationId),
  leadSourceIdx: index('idx_finance_commissions_lead_source').on(table.leadSourceId),
  agentIdx: index('idx_finance_commissions_agent').on(table.agentId),
}));

// ============================================
// PRICING RATES TABLE
// ============================================
export const pricingRates = pgTable('pricing_rates', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }).notNull(),
  baseYear: integer('base_year').notNull(),
  channel: varchar('channel', { length: 100 }).notNull(),
  limitOccupant: integer('limit_occupant').notNull(),
  extraOccupantFee: jsonb('extra_occupant_fee'),
  firstNightSurcharge: decimal('first_night_surcharge', { precision: 10, scale: 2 }).notNull(),
  oneNightStaySurcharge: decimal('one_night_stay_surcharge', { precision: 10, scale: 2 }).notNull(),
  seasons: jsonb('seasons').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  tenantIdx: index('idx_pricing_rates_tenant').on(table.tenantId),
  homeIdx: index('idx_pricing_rates_home').on(table.homeId),
  channelIdx: index('idx_pricing_rates_channel').on(table.channel),
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

export type CrmContact = typeof crmContacts.$inferSelect;
export type NewCrmContact = typeof crmContacts.$inferInsert;

export type CrmLeadSource = typeof crmLeadSources.$inferSelect;
export type NewCrmLeadSource = typeof crmLeadSources.$inferInsert;

export type BookingReservation = typeof bookingReservations.$inferSelect;
export type NewBookingReservation = typeof bookingReservations.$inferInsert;

export type BookingFinancial = typeof bookingFinancials.$inferSelect;
export type NewBookingFinancial = typeof bookingFinancials.$inferInsert;

export type BookingNote = typeof bookingNotes.$inferSelect;
export type NewBookingNote = typeof bookingNotes.$inferInsert;

export type FinanceCommission = typeof financeCommissions.$inferSelect;
export type NewFinanceCommission = typeof financeCommissions.$inferInsert;

export type PricingRate = typeof pricingRates.$inferSelect;
export type NewPricingRate = typeof pricingRates.$inferInsert;

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
export type InventoryPurchaseOrder = typeof inventoryPurchaseOrders.$inferSelect;
export type NewInventoryPurchaseOrder = typeof inventoryPurchaseOrders.$inferInsert;
export type InventoryActionRequest = typeof inventoryActionRequests.$inferSelect;
export type NewInventoryActionRequest = typeof inventoryActionRequests.$inferInsert;
export type InventoryPurchaseOrderItem = typeof inventoryPurchaseOrderItems.$inferSelect;
export type NewInventoryPurchaseOrderItem = typeof inventoryPurchaseOrderItems.$inferInsert;

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
  locationTypeId?: number | null;
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

// ============================================
// RESERVATIONS TABLE (Property Bookings)
// ============================================
export const reservations = pgTable('reservations', {
  id: serial('id').primaryKey(),
  
  // Tenant fields (following multi-tenant pattern)
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  homeId: integer('home_id').references(() => homes.id, { onDelete: 'cascade' }).notNull(),
  
  // External booking system ID
  bookingId: integer('booking_id').notNull().unique(),
  
  // Guest information
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }),
  email: varchar('email', { length: 500 }),
  birthday: varchar('birthday', { length: 20 }), // Format: "0000-00-00" or actual date
  birthplace: varchar('birthplace', { length: 255 }),
  phone1: varchar('phone1', { length: 50 }),
  phone2: varchar('phone2', { length: 50 }),
  country: varchar('country', { length: 10 }),
  phoneCountryCode: varchar('phone_country_code', { length: 10 }),
  address: text('address'),
  city: varchar('city', { length: 255 }),
  state: varchar('state', { length: 255 }),
  postcode: varchar('postcode', { length: 50 }),
  fiscalCode: varchar('fiscal_code', { length: 100 }),
  other: text('other'),
  
  // Booking status and notes
  status: varchar('status', { length: 50 }).notNull(), // reserved, confirmed, cancelled, etc.
  agreeTermNote: text('agree_term_note'),
  managerNote: text('manager_note'),
  
  // Property and booking references
  propertyName: varchar('property_name', { length: 255 }),
  propertyId: integer('property_id'),
  ownerBook: integer('owner_book').default(0),
  leadsourceId: integer('leadsource_id'),
  brandId: integer('brand_id'),
  
  // Financial details
  totalRent: decimal('total_rent', { precision: 10, scale: 2 }),
  taxTotal: decimal('tax_total', { precision: 10, scale: 2 }),
  serviceTotal: decimal('service_total', { precision: 10, scale: 2 }),
  discountTotal: decimal('discount_total', { precision: 10, scale: 2 }),
  grandTotal: decimal('grand_total', { precision: 10, scale: 2 }),
  damageDeposit: decimal('damage_deposit', { precision: 10, scale: 2 }),
  channelFee: decimal('channel_fee', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('USD'),
  
  // Stay details
  checkin: timestamp('checkin', { withTimezone: true }),
  checkout: timestamp('checkout', { withTimezone: true }),
  qtyOfNights: integer('qty_of_nights'),
  minNightlyPrice: decimal('min_nightly_price', { precision: 10, scale: 2 }),
  maxNightlyPrice: decimal('max_nightly_price', { precision: 10, scale: 2 }),
  nightlyPriceDetail: jsonb('nightly_price_detail'), // JSON object with date: price
  
  // Guest count and stay requirements
  numberOfAdults: integer('number_of_adults'),
  numberOfChildren: integer('number_of_children'),
  minimumStay: integer('minimum_stay'),
  maximumStay: integer('maximum_stay'),
  
  // Additional booking data (arrays from JSON)
  discount: jsonb('discount'), // Array of discount objects
  dynamicOptions: jsonb('dynamic_options'), // Array of dynamic option objects
  tax: jsonb('tax'), // Array of tax objects
  service: jsonb('service'), // Array of service objects
  
  // Timestamps
  createdDate: timestamp('created_date', { withTimezone: true }),
  updatedDate: timestamp('updated_date', { withTimezone: true }),
  cancellationDate: timestamp('cancellation_date', { withTimezone: true }),
  
  // System fields
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  customerIdx: index('idx_reservations_customer').on(table.customerId),
  homeIdx: index('idx_reservations_home').on(table.homeId),
  bookingIdIdx: index('idx_reservations_booking_id').on(table.bookingId),
  propertyIdx: index('idx_reservations_property').on(table.propertyId),
  statusIdx: index('idx_reservations_status').on(table.status),
  checkinIdx: index('idx_reservations_checkin').on(table.checkin),
  checkoutIdx: index('idx_reservations_checkout').on(table.checkout),
  emailIdx: index('idx_reservations_email').on(table.email),
  activeIdx: index('idx_reservations_active').on(table.isActive),
}));

// ... Add more API types as needed
