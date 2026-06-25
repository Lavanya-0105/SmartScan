export interface VendorListing {
  storeName: string;
  price: number;
  url: string;
  isExactMatch: boolean;
  inStock: boolean;
}

export interface UnifiedProductDTO {
  id: number;
  title: string;
  imageUrl: string;
  upc: string;
  modelNumber: string;
  sources: VendorListing[];
  lowestPrice: number;
}
