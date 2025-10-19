/**
 * Generate Zod Schema Examples
 * 
 * Uses runtime introspection to extract the ACTUAL expanded Zod schemas
 * that clients will import. Shows every field, type, and default.
 * 
 * These files are for REFERENCE ONLY - not for import/use.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as zodSchemas from '../dist/zod.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output directory (git-ignored)
const outputDir = join(__dirname, '..', 'zod-examples');

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Schema definitions to extract
const schemas = [
  { name: 'productsValidationSchema', table: 'products' },
  { name: 'skusValidationSchema', table: 'skus' },
  { name: 'inventoryItemsValidationSchema', table: 'inventory_items' },
  { name: 'locationsValidationSchema', table: 'locations' },
  { name: 'categoriesValidationSchema', table: 'categories' },
  { name: 'brandsValidationSchema', table: 'brands' },
  { name: 'vendorsValidationSchema', table: 'vendors' },
  { name: 'homesValidationSchema', table: 'homes' },
  { name: 'tagsValidationSchema', table: 'tags' },
];

console.log('🔍 Introspecting Zod schemas...\n');

/**
 * Convert a Zod schema to TypeScript-like code representation
 */
function zodToTypeScript(schema: z.ZodType, indent = '  '): string {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const fields: string[] = [];
    
    for (const [key, value] of Object.entries(shape)) {
      const fieldType = zodTypeToString(value as z.ZodType);
      fields.push(`${indent}${key}: ${fieldType}`);
    }
    
    return `z.object({\n${fields.join(',\n')}\n})`;
  }
  
  return zodTypeToString(schema);
}

/**
 * Convert a Zod type to string representation
 */
function zodTypeToString(schema: z.ZodType): string {
  const def = (schema as any)._def;
  const typeName = def.typeName;
  
  // Handle ZodDefault
  if (typeName === 'ZodDefault') {
    const innerType = zodTypeToString(def.innerType);
    const defaultValue = JSON.stringify(def.defaultValue());
    return `${innerType}.default(${defaultValue})`;
  }
  
  // Handle ZodOptional
  if (typeName === 'ZodOptional') {
    return `${zodTypeToString(def.innerType)}.optional()`;
  }
  
  // Handle ZodNullable
  if (typeName === 'ZodNullable') {
    return `${zodTypeToString(def.innerType)}.nullable()`;
  }
  
  // Handle ZodEnum
  if (typeName === 'ZodEnum') {
    const values = def.values.map((v: any) => `'${v}'`).join(', ');
    return `z.enum([${values}])`;
  }
  
  // Handle ZodArray
  if (typeName === 'ZodArray') {
    return `z.array(${zodTypeToString(def.type)})`;
  }
  
  // Handle ZodString
  if (typeName === 'ZodString') {
    return 'z.string()';
  }
  
  // Handle ZodNumber
  if (typeName === 'ZodNumber') {
    return 'z.number()';
  }
  
  // Handle ZodBoolean
  if (typeName === 'ZodBoolean') {
    return 'z.boolean()';
  }
  
  // Handle ZodDate
  if (typeName === 'ZodDate') {
    return 'z.date()';
  }
  
  // Handle ZodAny
  if (typeName === 'ZodAny') {
    return 'z.any()';
  }
  
  // Fallback
  return `z.${typeName.replace('Zod', '').toLowerCase()}()`;
}

for (const { name, table } of schemas) {
  const schema = (zodSchemas as any)[name];
  
  if (!schema) {
    console.log(`⚠️  Could not find schema: ${name}`);
    continue;
  }

  const schemaCode = zodToTypeScript(schema);

  const content = `/**
 * ${table.toUpperCase()} - Actual Client-Facing Zod Schema
 * 
 * This shows the EXACT expanded schema that clients import and use.
 * Generated via runtime introspection of the compiled schema.
 * 
 * ⚠️ THIS FILE IS FOR REFERENCE ONLY
 * DO NOT IMPORT THIS FILE IN YOUR CODE
 * 
 * Import from the package instead:
 * import { ${name} } from '@postgress/shared/zod';
 */

import { z } from 'zod';

// ============================================================
// ACTUAL SCHEMA CLIENTS IMPORT
// ============================================================

export const ${name} = ${schemaCode};

// ============================================================
// USAGE IN CLIENT
// ============================================================

/**
 * Basic usage - defaults auto-populate:
 * 
 * import { ${name} } from '@postgress/shared/zod';
 * 
 * const formData = {
 *   name: 'Example',
 *   slug: 'example'
 * };
 * 
 * const validated = ${name}.parse(formData);
 * // Result includes all defaults automatically
 */

/**
 * Extend for custom form validation:
 * 
 * import { ${name} } from '@postgress/shared/zod';
 * 
 * const formSchema = ${name}.extend({
 *   name: z.string().min(1, "Name is required"),
 *   // Add your custom rules here
 * });
 */

/**
 * Use .partial() for update forms:
 * 
 * const updateSchema = ${name}.partial();
 * // All fields become optional
 */

/**
 * Use .pick() for subset forms:
 * 
 * const quickSchema = ${name}.pick({
 *   name: true,
 *   slug: true,
 * });
 */

/**
 * Type inference:
 * 
 * import { ${name} } from '@postgress/shared/zod';
 * import type { z } from 'zod';
 * 
 * type FormData = z.infer<typeof ${name}>;
 */
`;

  const filename = join(outputDir, `${table}.ts`);
  writeFileSync(filename, content, 'utf-8');
  console.log(`✅ Generated: ${table}.ts`);
}

// Create README
const readmeContent = `# Zod Schema Reference Files

This directory contains the **actual runtime-introspected Zod schemas** showing exactly what clients import.

## Purpose

These files let you see exactly what schemas are available to the client and what defaults are pre-configured. Use them to determine what (if anything) you need to extend in your client forms.

## ⚠️ Important

**DO NOT IMPORT THESE FILES IN YOUR CODE!**

These are for **reference only**. Always import from the package:

\`\`\`typescript
import { productsValidationSchema } from '@postgress/shared/zod';
\`\`\`

## Files

- \`products.ts\` - Products schema with defaults
- \`skus.ts\` - SKUs schema with defaults
- \`inventory_items.ts\` - Inventory items schema with defaults
- \`locations.ts\` - Locations schema with defaults
- \`categories.ts\` - Categories schema with defaults
- \`brands.ts\` - Brands schema with defaults
- \`vendors.ts\` - Vendors schema with defaults
- \`homes.ts\` - Homes schema with defaults
- \`tags.ts\` - Tags schema with defaults

## What You'll See

Each file shows:
1. The complete expanded schema (all fields with types)
2. All default values configured
3. Usage examples for client forms
4. How to extend for custom validation

## Regenerating

To regenerate these reference files after changing schemas:

\`\`\`powershell
npm run generate-examples
\`\`\`

Or as part of the full update workflow:

\`\`\`powershell
npm run update
\`\`\`

---

**Generated by:** \`scripts/generate-zod-examples.ts\`
`;

writeFileSync(join(outputDir, 'README.md'), readmeContent, 'utf-8');
console.log(`✅ Created: README.md`);

console.log(`\n✨ Done! Generated ${schemas.length} schema files to zod-examples/\n`);
console.log('📝 Review these files to see what needs extending in client forms.');
