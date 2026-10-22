// The product catalog: what each SKU is, which rack it sits on, and what a screen shows for it.
// The pickup detector reads the same file (data/products.json).

import productsJson from "@/data/products.json";
import rackMapJson from "@/data/rack-map.json";
import type { RackMap } from "./join";

const rackMap = rackMapJson as RackMap;
export const racks = rackMap.racks;

export type Product = {
  sku: string;
  rack: string;
  name: string;
  colour: string;
  hex: string;
  kind: string; // tee, shirt, jacket, kurta, dress, jeans, bag, belt, scarf
  price: number;
  tagline: string;
  details: string[];
};

export const products = (productsJson as { products: Product[] }).products;
export const productBySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));

export const rackName = (rackId: string) => rackMap.racks.find((r) => r.id === rackId)?.name ?? rackId;

export const formatPrice = (rupees: number) => `₹${rupees.toLocaleString("en-IN")}`;
