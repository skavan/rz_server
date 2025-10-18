/**
 * Schema Code Generator - Generate Zod schema code for extending
 * Run with: npx tsx generate-schema-code.ts [tableName]
 * Example: npx tsx generate-schema-code.ts inventoryItems
 */

import { 
  inventoryItemValidationSchema,
  productValidationSchema,
  skuValidationSchema,
  locationValidationSchema,
  categoriesValidationSchema,
  brandsValidationSchema,
  vendorsValidationSchema,
  homesValidationSchema,
  tagsValidationSchema
} from './src/index.js';

const schemas = {
  inventoryItems: inventoryItemValidationSchema,
  products: productValidationSchema,
  skus: skuValidationSchema,
  locations: locationValidationSchema,
  categories: categoriesValidationSchema,
  brands: brandsValidationSchema,
  vendors: vendorsValidationSchema,
  homes: homesValidationSchema,
  tags: tagsValidationSchema
};

// Get table name from command line or show all
const tableName = process.argv[2];

function getZodTypeName(schema: any): string {
  const typeName = schema._def?.typeName;
  
  // Handle optional types
  if (typeName === 'ZodOptional') {
    const innerType = getZodTypeName(schema._def.innerType);
    return `${innerType}.optional()`;
  }
  
  // Handle default types
  if (typeName === 'ZodDefault') {
    const innerType = getZodTypeName(schema._def.innerType);
    const defaultValue = JSON.stringify(schema._def.defaultValue());
    return `${innerType}.default(${defaultValue})`;
  }
  
  // Handle nullable (check _def not method to avoid circular)
  if (schema._def?.innerType && typeName === 'ZodNullable') {
    return getZodTypeName(schema._def.innerType) + '.nullable()';
  }
  
  // Base types
  switch (typeName) {
    case 'ZodString':
      return 'z.string()';
    case 'ZodNumber':
      return 'z.number()';
    case 'ZodBoolean':
      return 'z.boolean()';
    case 'ZodDate':
      return 'z.date()';
    case 'ZodArray':
      const itemType = schema._def.type ? getZodTypeName(schema._def.type) : 'z.any()';
      return `z.array(${itemType})`;
    case 'ZodObject':
      return 'z.object({...})';
    case 'ZodEnum':
      const values = schema._def.values.map((v: any) => `'${v}'`).join(', ');
      return `z.enum([${values}])`;
    case 'ZodUnion':
      return 'z.union([...])';
    case 'ZodLazy':
      return 'z.lazy(...)';
    case 'ZodNullable':
      return 'z.nullable()';
    default:
      return `z.unknown() /* ${typeName} */`;
  }
}

function generateSchemaCode(name: string, schema: any) {
  console.log(`\n// ${name} Validation Schema`);
  console.log(`export const ${name}ValidationSchema = z.object({`);
  
  const fields = Object.keys(schema.shape);
  fields.forEach((field, index) => {
    const fieldSchema = schema.shape[field];
    const zodType = getZodTypeName(fieldSchema);
    const comma = index < fields.length - 1 ? ',' : '';
    console.log(`  ${field}: ${zodType}${comma}`);
  });
  
  console.log(`});\n`);
  
  // Show example extension
  console.log(`// Example: Extend for form validation`);
  console.log(`export const ${name}FormSchema = ${name}ValidationSchema.extend({`);
  console.log(`  // Add custom validations here`);
  console.log(`  // name: z.string().min(1, 'Name is required'),`);
  console.log(`  // email: z.string().email('Invalid email'),`);
  console.log(`});\n`);
  
  // Show partial schema
  console.log(`// Example: Partial schema for updates`);
  console.log(`export const ${name}UpdateSchema = ${name}ValidationSchema.partial();\n`);
  
  // Show pick/omit examples
  console.log(`// Example: Pick only specific fields`);
  console.log(`export const ${name}FormPickSchema = ${name}ValidationSchema.pick({`);
  const firstFewFields = fields.slice(0, 3);
  firstFewFields.forEach((field, index) => {
    const comma = index < firstFewFields.length - 1 ? ',' : '';
    console.log(`  ${field}: true${comma}`);
  });
  console.log(`});\n`);
}

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        ZOD SCHEMA CODE GENERATOR                         ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

if (tableName && schemas[tableName as keyof typeof schemas]) {
  generateSchemaCode(tableName, schemas[tableName as keyof typeof schemas]);
} else if (tableName) {
  console.log(`\n❌ Unknown table: ${tableName}`);
  console.log('\nAvailable tables:', Object.keys(schemas).join(', '));
} else {
  // Show all schemas
  Object.entries(schemas).forEach(([name, schema]) => {
    generateSchemaCode(name, schema);
    console.log('─'.repeat(60));
  });
}

console.log('\n✅ Done! Copy the code above to extend your schemas.\n');
