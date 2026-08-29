# EvryBites Domain Glossary

## Batch

The atomic unit of sale for a product. Each product defines its batch size (e.g., Cookies = 12, Brownies = 6, Cupcakes = 6). A customer orders N batches of a product; `order_items.quantity` is always a count of batches, never individual pieces.

## Product

A baked good available for purchase. Each product has a name, description, price (per batch), batch size, unit label (display string, e.g. "dozen"), image, and an active flag to control visibility.

## Product Cost Record

A dated entry in a Product's cost history — what a Batch of that Product cost to make, effective from a given date. Immutable and append-only: a Product Cost Record is never edited or deleted, only superseded by a later one. Each record stores only an *effective-from* date, never an end date — the cost that applied to a Sale is whichever record has the latest effective-from date on or before that Sale's date, so adding a new record automatically closes out the previous one with no possibility of a gap or an overlap. Supersedes the single (non-historical) cost-per-batch value products used to carry — existing values were migrated into each product's first Product Cost Record, effective from the product's creation date. Exists to eventually support a profit calculation (Sales Revenue minus cost of goods sold); nothing in the product surfaces that calculation yet.

## Order

A customer's request to purchase one or more products. Contains customer contact info, fulfillment details, a Payment Method, and a status that progresses through a defined lifecycle.

## Order Item

A line within an Order linking a Product to a quantity (in batches) and a unit price snapshot taken at the time the order was placed.

## Fulfillment Type

How the order reaches the customer: `local_delivery` (Rapid City, SD area), `shipping` (mailed to a full address), or `pickup` (handed over immediately at an in-person Point of Sale checkout — no address at all). Determines which address field is meaningful (neither, for `pickup`). Does not affect the Order Status progression — `delivered` is the single terminal status for all three types, and `pickup` orders reach it the moment they're rung up (see Point of Sale).

## Sales Channel

A reporting-only grouping derived from Fulfillment Type, not a stored field of its own: `pickup` is the **Point of Sale** channel, while `local_delivery` and `shipping` together are the **Customer Web** channel. Used to filter or break down sales reports by where the sale happened, without introducing a second field that could drift out of sync with Fulfillment Type.

## Point of Sale

The staff-facing counter checkout (`/admin/pos`), used for in-person walk-up sales as an alternative to the customer-facing online order form. Every order it creates has Fulfillment Type `pickup`. Customer name/email/phone are optional — an anonymous cash sale is allowed, stored as empty strings rather than nulls (the schema still requires the fields; a receipt/confirmation email is simply skipped when no address was given). Manually-typed card numbers go through PayPal's hosted Card Fields, same as the online order form's "Credit / Debit Card" option — this app never receives or stores raw card data. A physical PayPal card reader used at the register is a separate, un-integrated device running PayPal's own POS app; it has no code path here.

Payment can be split across multiple Tenders within one checkout — the cashier picks a payment method and an amount (defaulting to the full remaining balance, editable down for a partial payment) and submits it. The Order is created by the *first* Tender submitted, not by a separate "start sale" step — a single full payment still feels like one click. If that first Tender doesn't cover the total, the Order sits at `pending_payment` with a running "collected so far / remaining" banner in place of the product grid until enough further Tenders (possibly the same method used more than once) cover it, at which point Order Status advances to `received` exactly as it always has for a single full payment. A "Cancel Sale" action is available during an in-progress split sale to call off the Order (via Order Cancellation) and return to a fresh, empty cart.

## Cart

The customer's in-progress selection of products and quantities before they submit an Order. Persisted in browser localStorage — no server storage. Scoped to a single device/browser. Cleared on successful order submission.

## Order Status

The lifecycle state of an Order. Forward progression:

- `pending_payment` — order created but its total not yet fully collected (e.g. awaiting a PayPal/Venmo payment link, or a Point of Sale split sale still short of its total); skipped when a single payment covers the whole total at submission
- `received` — set automatically on submission, or once `pending_payment` is fully paid; the moment an Order first reaches `received` is recorded (`receivedAt`) — this is the date a Sale is attributed to, not the possibly-earlier `createdAt`
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

Calling off an Order before fulfillment completes. Whether it is a **cancellation** or a **refund** depends on how far the order had progressed: orders in `ready`, `shipped`, or `delivered` are refunded (money already changed hands); orders in any earlier status are simply cancelled. Both end in a terminal Order Status (`cancelled` or `refunded` respectively) and are irreversible in the current system. PayPal captures (main and Custom Payment Request) are refunded automatically; any Cash Collected must be returned to the customer manually — the owner is prompted with a summary of what was auto-refunded versus what still needs manual return. Centralized in the `cancelOrder` mutation (`server/routers/orders.ts`); the refund/cancel split is defined by `REFUND_STATUSES`. The moment an Order reaches `refunded` is recorded (`refundedAt`) — this is the date a Refund is attributed to, independent of when the original Sale happened.

## Sale

A reporting concept, not a stored entity: an Order that reached `received` or later — `pending_payment` and `cancelled` orders never had a payment collected, so they're never Sales. A Sale is attributed to the period containing its `receivedAt` date. A `refunded` Order still counts as a Sale for the period it was originally received — gross, not netted — and separately counts as a Refund for the period it was refunded in; the same Order can appear in both, in different periods, which is why refunding something doesn't retroactively change a past period's sales figures.

## Refund

The reporting counterpart to a Sale: an Order that reached `refunded`, attributed to the period containing its `refundedAt` date (which may be a different period than its Sale). Sales Revenue and Refunds Total are reported side by side, plus their difference as Net Revenue — none of the three are stored, all are computed from Orders' `receivedAt`/`refundedAt` and `totalAmount`.

## Payment Method

The channel the customer originally chose to pay with at checkout: `venmo`, `paypal`, `cash`, or `check`. Reflects intent at order time, not necessarily how the Balance Due ultimately gets collected — an Order can accumulate Cash Collected and Custom Payment Requests on other channels without its Payment Method changing. Changing this field outright (via "Change Payment Method") is reserved for correcting a wrong original choice, and is only available before any payment has been collected; once money has changed hands, the owner requests the remainder through a Custom Payment Request instead. _Avoid_: "payment type" for this field once any payment has been collected — at that point the true payment picture is Cash Collected + Custom Payment Requests, not this field.

## Cash Collected

A running total of cash or check physically collected against an Order, logged manually by the owner. Independent of the Order's current Payment Method — persists and displays regardless of what Payment Method says. Never negative; overpayment is not tracked as credit, and Balance Due simply clamps at zero once covered. Unlike a Custom Payment Request, it's a single running total rather than discrete entries — logging again overwrites the prior value rather than adding to it. Can be cleared back to not-logged by the owner (e.g. logged by mistake), the same reversibility a manually-marked Custom Payment Request has.

## Custom Payment Request

A request for part (or all) of an Order's Balance Due through a specific channel — `paypal` or `venmo` — distinct from the Order's Payment Method. PayPal requests are captured and marked paid automatically through the customer-facing payment link; Venmo requests have no capture API and are marked paid manually by the owner. Either kind can also be marked paid manually as a fallback, since real payments don't always arrive through the tracked path. A manually-marked payment can be undone by the owner (e.g. marked by mistake); a real captured PayPal payment cannot — undoing that requires an actual refund, handled through Order Cancellation instead. An Order can carry several — paid and pending — across both channels.

## Tender

A single, immutable record of one payment applied to an Order at checkout time on the Point of Sale page — `cash`, `paypal`, or `venmo` (a manually-typed card goes through PayPal's Card Fields and is recorded as `paypal`, the same collapsing the general checkout flow already does for the online store). An Order can accumulate several Tenders across different methods — or the same method more than once — to cover its total; this is what makes split/partial payment possible at the register. Distinct from Cash Collected and Custom Payment Request, which track payment collected *after* checkout on the customer-facing side and each only ever hold one running value or one request at a time. Once recorded, a Tender is never edited or un-recorded — only Order Cancellation undoes its effect, refunding or flagging each Tender individually the same way it already does for Cash Collected and PayPal captures.

## Balance Due

An Order's total minus its Cash Collected, paid Custom Payment Requests, and Tenders. Drives whether the owner can request more payment (or, on the Point of Sale page, how much remains to collect) and what amount that request defaults to. Clamped at zero — never shown or tracked as negative.

## Admin Session

Access to `/admin/*`. There is no per-person admin account — a single shared password, plus a Verification Code emailed to an address checked against a fixed allowlist, together grant one shared session. Distinct from a Customer's account (Clerk-based, used only on the customer-facing order flow).

## Verification Code

A 6-digit, single-use, time-limited code emailed to an address the owner typed in after the shared password succeeded — the second factor of an Admin Session. Expires after 10 minutes or 5 wrong attempts, whichever comes first; a fresh one can be requested no more than once per minute per email address. Never tied to a stored identity — the email address is checked against the allowlist at request time, not stored as "who logged in." SMS is not used anywhere in this app.
