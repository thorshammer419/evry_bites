// A product hidden on both channels is decommissioned without being deleted
// — see the Product glossary entry in CONTEXT.md.
export function isDecommissioned(product: { posVisible: boolean; storefrontVisible: boolean }): boolean {
  return !product.posVisible && !product.storefrontVisible;
}
