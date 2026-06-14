# EvryBites Domain Glossary

## Batch

The atomic unit of sale for a product. Each product defines its batch size (e.g., Cookies = 12, Brownies = 6, Cupcakes = 6). A customer orders N batches of a product; `order_items.quantity` is always a count of batches, never individual pieces.

## Product

A baked good available for purchase. Each product has a name, description, price (per batch), batch size, unit label (display string, e.g. "dozen"), image, and an active flag to control visibility.

## Order

A customer's request to purchase one or more products. Contains customer contact info, fulfillment details, payment method preference, and a status that progresses through a defined lifecycle.

## Order Item

A line within an Order linking a Product to a quantity (in batches) and a unit price snapshot taken at the time the order was placed.

## Fulfillment Type

How the order reaches the customer. Either `local_delivery` (Rapid City, SD area) or `shipping` (mailed to a full address). Determines which address field is meaningful and which terminal status applies.

## Cart

The customer's in-progress selection of products and quantities before they submit an Order. Persisted in browser localStorage — no server storage. Scoped to a single device/browser. Cleared on successful order submission.

## Order Status

The lifecycle state of an Order. Progression:

- `received` — set automatically on submission
- `confirmed` — owner marks order as being prepared
- `ready` — owner marks order as ready
- `shipped` — terminal state for shipping orders
- `delivered` — terminal state for local delivery orders
