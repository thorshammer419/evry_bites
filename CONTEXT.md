# EvryBites Domain Glossary

## Batch

The atomic unit of sale for a product. Each product defines its batch size (e.g., Cookies = 12, Brownies = 6, Cupcakes = 6). A customer orders N batches of a product; `order_items.quantity` is always a count of batches, never individual pieces.

## Product

A baked good available for purchase. Each product has a name, description, price (per batch), batch size, unit label (display string, e.g. "dozen"), image, and an active flag to control visibility.

## Order

A customer's request to purchase one or more products. Contains customer contact info, fulfillment details, a Payment Method, and a status that progresses through a defined lifecycle.

## Order Item

A line within an Order linking a Product to a quantity (in batches) and a unit price snapshot taken at the time the order was placed.

## Fulfillment Type

How the order reaches the customer: `local_delivery` (Rapid City, SD area), `shipping` (mailed to a full address), or `pickup` (handed over immediately at an in-person Point of Sale checkout — no address at all). Determines which address field is meaningful (neither, for `pickup`). Does not affect the Order Status progression — `delivered` is the single terminal status for all three types, and `pickup` orders reach it the moment they're rung up (see Point of Sale).

## Point of Sale

The staff-facing counter checkout (`/admin/pos`), used for in-person walk-up sales as an alternative to the customer-facing online order form. Every order it creates has Fulfillment Type `pickup`. Customer name/email/phone are optional — an anonymous cash sale is allowed, stored as empty strings rather than nulls (the schema still requires the fields; a receipt/confirmation email is simply skipped when no address was given). Payment is always collected in the same transaction as checkout — Order Status goes straight to `received` (cash, logged as Cash Collected equal to the full total) or through the normal PayPal/Venmo capture flow, never `pending_payment` left open. Manually-typed card numbers go through PayPal's hosted Card Fields, same as the online order form's "Credit / Debit Card" option — this app never receives or stores raw card data. A physical PayPal card reader used at the register is a separate, un-integrated device running PayPal's own POS app; it has no code path here.

## Cart

The customer's in-progress selection of products and quantities before they submit an Order. Persisted in browser localStorage — no server storage. Scoped to a single device/browser. Cleared on successful order submission.

## Order Status

The lifecycle state of an Order. Forward progression:

- `pending_payment` — order created but payment not yet collected (e.g. awaiting a PayPal/Venmo payment link); skipped when payment is captured at submission
- `received` — set automatically on submission, or once `pending_payment` is fully paid
- `processing` — owner marks order as being prepared
- `ready` — owner marks order as ready
- `shipped` — owner marks order as shipped
- `delivered` — terminal state

Two additional terminal states sit outside the forward progression:

- `cancelled` — order called off before payment was collected/completed (see Order Cancellation)
- `refunded` — order called off after reaching `ready`, `shipped`, or `delivered` (see Order Cancellation)

## Order Lifecycle

The structural rules governing which Order Status transitions are legal and what comes next. Forward/backward steps are a fixed sequence independent of Fulfillment Type; `received` has no backward step (`pending_payment` is not meaningful once received). `cancelled` and `refunded` are reached only through Order Cancellation, never through ordinary forward/backward movement, and have no step back. Centralized in `lib/order-lifecycle.ts`; exposes `isValidTransition`, `nextStatuses`, `previousStatus`, and `isTerminal` (true only for `delivered`, `cancelled`, `refunded`).

## Order Cancellation

Calling off an Order before fulfillment completes. Whether it is a **cancellation** or a **refund** depends on how far the order had progressed: orders in `ready`, `shipped`, or `delivered` are refunded (money already changed hands); orders in any earlier status are simply cancelled. Both end in a terminal Order Status (`cancelled` or `refunded` respectively) and are irreversible in the current system. PayPal captures (main and Custom Payment Request) are refunded automatically; any Cash Collected must be returned to the customer manually — the owner is prompted with a summary of what was auto-refunded versus what still needs manual return. Centralized in the `cancelOrder` mutation (`server/routers/orders.ts`); the refund/cancel split is defined by `REFUND_STATUSES`.

## Payment Method

The channel the customer originally chose to pay with at checkout: `venmo`, `paypal`, `cash`, or `check`. Reflects intent at order time, not necessarily how the Balance Due ultimately gets collected — an Order can accumulate Cash Collected and Custom Payment Requests on other channels without its Payment Method changing. Changing this field outright (via "Change Payment Method") is reserved for correcting a wrong original choice, and is only available before any payment has been collected; once money has changed hands, the owner requests the remainder through a Custom Payment Request instead. _Avoid_: "payment type" for this field once any payment has been collected — at that point the true payment picture is Cash Collected + Custom Payment Requests, not this field.

## Cash Collected

A running total of cash or check physically collected against an Order, logged manually by the owner. Independent of the Order's current Payment Method — persists and displays regardless of what Payment Method says. Never negative; overpayment is not tracked as credit, and Balance Due simply clamps at zero once covered. Unlike a Custom Payment Request, it's a single running total rather than discrete entries — logging again overwrites the prior value rather than adding to it. Can be cleared back to not-logged by the owner (e.g. logged by mistake), the same reversibility a manually-marked Custom Payment Request has.

## Custom Payment Request

A request for part (or all) of an Order's Balance Due through a specific channel — `paypal` or `venmo` — distinct from the Order's Payment Method. PayPal requests are captured and marked paid automatically through the customer-facing payment link; Venmo requests have no capture API and are marked paid manually by the owner. Either kind can also be marked paid manually as a fallback, since real payments don't always arrive through the tracked path. A manually-marked payment can be undone by the owner (e.g. marked by mistake); a real captured PayPal payment cannot — undoing that requires an actual refund, handled through Order Cancellation instead. An Order can carry several — paid and pending — across both channels.

## Balance Due

An Order's total minus its Cash Collected minus its paid Custom Payment Requests. Drives whether the owner can request more payment and what amount that request defaults to. Clamped at zero — never shown or tracked as negative.

## Admin Session

Access to `/admin/*`. There is no per-person admin account — a single shared password, plus a Verification Code emailed to an address checked against a fixed allowlist, together grant one shared session. Distinct from a Customer's account (Clerk-based, used only on the customer-facing order flow).

## Verification Code

A 6-digit, single-use, time-limited code emailed to an address the owner typed in after the shared password succeeded — the second factor of an Admin Session. Expires after 10 minutes or 5 wrong attempts, whichever comes first; a fresh one can be requested no more than once per minute per email address. Never tied to a stored identity — the email address is checked against the allowlist at request time, not stored as "who logged in." SMS is not used anywhere in this app.
