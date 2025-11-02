import { createInsertSchema } from 'drizzle-zod';
import { locations } from './dist/schema.js';

const schema = createInsertSchema(locations);

console.log('Generated Zod schema keys:');
console.log(Object.keys(schema.shape));
