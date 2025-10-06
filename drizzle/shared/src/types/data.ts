/**
 * Core Data Types
 * 
 * Centralized data structure definitions used across all engines
 */

export type DataSourceKey = 
  | "products"
  | "categories" 
  | "inventory_items"
  | "skus"
  | "locations"
  | "tags"
  | "brands"
  | "vendors"
  | "customers"
  | "homes"
  | string; // extensible

// Legacy aliases for compatibility
export type FormDataSourceKey = DataSourceKey;

export type CoreTableData = {
  products?: any[];
  categories?: any[];
  inventory_items?: any[];
  skus?: any[];
  locations?: any[];
  tags?: any[];
  brands?: any[];
  vendors?: any[];
  customers?: any[];
  homes?: any[];
  [key: string]: any[] | undefined;
};

export type ComputedField = {
  targetField: string;
  type: 'lookup' | 'count' | 'sum' | 'static' | 'aggregate';
  from?: string;
  on?: string;
  select?: string;
  where?: string;
  value?: any;
  lookupTable?: string;
  lookupField?: string;
  selectField?: string;
};

export type RenderContext = {
  allData: CoreTableData;
  allItems: any;
  [key: string]: any;
};
