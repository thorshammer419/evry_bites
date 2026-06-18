"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@prisma/client";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useUser, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { CustomerHeader } from "../components/CustomerHeader";
import { CartProvider, useCart } from "../../lib/cart";
import { trpc } from "../../lib/trpc/react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

interface OrderFormClientProps {
  products: Product[];
}

type FulfillmentType = "local_delivery" | "shipping";
type PaymentMethod = "venmo" | "paypal" | "cash" | "check";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function OrderFormInner({ products }: OrderFormClientProps) {
  const router = useRouter();
  const { cart, hydrated, clearCart, reconcile } = useCart();
  const [removedItems, setRemovedItems] = useState<string[]>([]);
  const hasReconciled = useRef(false);

  useEffect(() => {
    if (!hydrated || hasReconciled.current) return;
    hasReconciled.current = true;
    const removed = reconcile(products.map((p) => p.id));
    if (removed.length > 0) setRemovedItems(removed);
  }, [hydrated, cart, products, reconcile]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("local_delivery");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("SD");
  const [zip, setZip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("venmo");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { user, isLoaded: clerkLoaded, isSignedIn } = useUser();
  const isCashCheck = paymentMethod === "cash" || paymentMethod === "check";
  const cashCheckApproved = Boolean(isSignedIn && user?.publicMetadata?.cashCheckApproved);
  const cashCheckPending = Boolean(isSignedIn && !cashCheckApproved && user?.unsafeMetadata?.cashCheckPending);

  // Ref keeps the latest handler without causing the autocomplete to re-initialize
  const handlePlaceSelectedRef = useRef<(components: google.maps.GeocoderAddressComponent[]) => void>(() => {});
  handlePlaceSelectedRef.current = (components) => {
    let streetNumber = "", route = "", newCity = "", newState = "", newZip = "";
    for (const c of components) {
      const t = c.types[0];
      if (t === "street_number") streetNumber = c.long_name;
      else if (t === "route") route = c.short_name;
      else if (t === "locality") newCity = c.long_name;
      else if (t === "administrative_area_level_1") newState = c.short_name;
      else if (t === "postal_code") newZip = c.long_name;
    }
    if (streetNumber && route) {
      const street = `${streetNumber} ${route}`;
      setAddressLine1(street);
      if (addressInputRef.current) addressInputRef.current.value = street;
    }
    if (newCity) setCity(newCity);
    if (newState) setState(newState);
    if (newZip) setZip(newZip);
    if (newCity && newState) {
      const isRapidCity = newCity.trim().toLowerCase() === "rapid city" && newState === "SD";
      setFulfillmentType(isRapidCity ? "local_delivery" : "shipping");
      if (!isRapidCity && paymentMethod === "cash") setPaymentMethod("paypal");
    }
  };

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    setOptions({ key: apiKey });
    importLibrary("places");
  }, []);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Sync addressLine1 state → DOM only when it changes from an external source
  // (Clerk autofill, place selection). Guard prevents cursor-reset during typing.
  useEffect(() => {
    if (addressInputRef.current && addressInputRef.current.value !== addressLine1) {
      addressInputRef.current.value = addressLine1;
    }
  }, [addressLine1]);

  const addressCallbackRef = useCallback((node: HTMLInputElement | null) => {
    addressInputRef.current = node;
    if (node === null) {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
      return;
    }
    if (autocompleteRef.current) return;
    importLibrary("places").then((lib) => {
      if (!node.isConnected || autocompleteRef.current) return;
      const { Autocomplete } = lib as google.maps.PlacesLibrary;
      autocompleteRef.current = new Autocomplete(node, {
        types: ["address"],
        componentRestrictions: { country: "us" },
        fields: ["address_components"],
      });
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current!.getPlace();
        if (place.address_components) handlePlaceSelectedRef.current(place.address_components);
      });
    });
  }, []);

  const hasAutoFilled = useRef(false);
  useEffect(() => {
    if (!clerkLoaded || !user || hasAutoFilled.current) return;
    hasAutoFilled.current = true;

    if (user.firstName) setFirstName(user.firstName);
    if (user.lastName) setLastName(user.lastName);
    const email = user.primaryEmailAddress?.emailAddress;
    if (email) setCustomerEmail(email);
    const rawPhone = user.phoneNumbers?.[0]?.phoneNumber ?? (user.publicMetadata?.phone as string | undefined);
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, "");
      const tenDigit = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
      setCustomerPhone(formatPhone(tenDigit));
    }

    const addr = user.unsafeMetadata?.address as
      | { addressLine1?: string; city?: string; state?: string; zip?: string }
      | undefined;
    if (addr) {
      if (addr.addressLine1) setAddressLine1(addr.addressLine1);
      if (addr.city) setCity(addr.city);
      if (addr.state) setState(addr.state);
      if (addr.zip) setZip(addr.zip);
      if (addr.city && addr.state) {
        const isRapidCity = addr.city.trim().toLowerCase() === "rapid city" && addr.state === "SD";
        setFulfillmentType(isRapidCity ? "local_delivery" : "shipping");
      }
    }
  }, [clerkLoaded, user]);

  async function saveAddressToClerk() {
    if (!user) return;
    user.update({
      unsafeMetadata: {
        ...user.unsafeMetadata,
        address: {
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          state,
          zip: zip.trim(),
        },
      },
    }).catch(() => {});
  }

  const pendingOrderRef = useRef<{ orderId: string; paypalOrderId: string } | null>(null);

  const lineItems = products
    .filter((p) => cart[p.id] && cart[p.id] > 0)
    .map((p) => ({
      product: p,
      quantity: cart[p.id] ?? 0,
      subtotal: Number(p.price) * (cart[p.id] ?? 0),
    }));

  const grandTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

  const submitMutation = trpc.orders.submit.useMutation({
    onSuccess: (order) => { saveAddressToClerk(); clearCart(); router.push(`/order/confirmation/${order.id}`); },
    onError: (error) => setFormError(error.message || "Something went wrong. Please try again."),
  });

  const createPaypalOrderMutation = trpc.orders.createPaypalOrder.useMutation();
  const capturePaypalOrderMutation = trpc.orders.capturePaypalOrder.useMutation({
    onSuccess: (order) => { saveAddressToClerk(); clearCart(); router.push(`/order/confirmation/${order.id}`); },
    onError: () => setFormError("Payment capture failed. Please try again."),
  });

  const [approvalRequested, setApprovalRequested] = useState(false);
  const requestApprovalMutation = trpc.orders.requestCashCheckApproval.useMutation({
    onSuccess: () => {
      setApprovalRequested(true);
      user?.update({ unsafeMetadata: { ...user.unsafeMetadata, cashCheckPending: true } }).catch(() => {});
    },
  });

  const inputClass = "w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-blue-900 focus:outline-none focus:ring-2 focus:ring-sky-400";
  const labelClass = "block text-sm font-medium text-blue-800 mb-1";
  const sectionHeaderClass = "text-sm font-semibold text-blue-900 uppercase tracking-wide mb-3";

  function collectFormData() {
    return {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      fulfillmentType,
      addressLine1: addressLine1.trim(),
      city: city.trim(),
      state,
      zip: zip.trim(),
      paymentMethod,
      notes: notes.trim() || undefined,
      items: lineItems.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
    };
  }

  function validate(): boolean {
    if (!firstName.trim()) { setFormError("Please enter your first name."); return false; }
    if (!lastName.trim()) { setFormError("Please enter your last name."); return false; }
    if (!customerEmail.trim()) { setFormError("Please enter your email address."); return false; }
    if (!customerPhone.trim()) { setFormError("Please enter your phone number."); return false; }
    if (!addressLine1.trim()) { setFormError("Please enter your address."); return false; }
    if (!city.trim()) { setFormError("Please enter your city."); return false; }
    if (!zip.trim() || !/^\d{5}$/.test(zip.trim())) { setFormError("Please enter a valid 5-digit ZIP code."); return false; }
    if (fulfillmentType === "local_delivery" && (city.trim().toLowerCase() !== "rapid city" || state !== "SD")) {
      setFormError("Local delivery is only available in Rapid City, SD. Please update your address or switch to Shipping.");
      return false;
    }
    if (lineItems.length === 0) { setFormError("Your cart is empty."); return false; }
    if (isCashCheck && !isSignedIn) { setFormError("Please sign in or create an account to use Cash/Check on delivery."); return false; }
    if (isCashCheck && !cashCheckApproved) { setFormError("Your account is pending admin approval for Cash/Check payments."); return false; }
    return true;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    submitMutation.mutate(collectFormData());
  };

  if (lineItems.length === 0) {
    return (
      <div className="min-h-screen bg-bakery-pattern flex items-center justify-center px-4">
        <div className="text-center">
          {removedItems.length > 0 && (
            <p className="text-sm text-blue-700 bg-sky-100 border border-sky-300 rounded-xl px-4 py-3 mb-6">
              Some items in your cart are no longer available and were removed.
            </p>
          )}
          <p className="text-5xl mb-4">🛒</p>
          <p className="text-blue-800 font-medium text-lg mb-2">Your cart is empty.</p>
          <p className="text-sky-600 text-sm mb-6">Go back to the menu to add items.</p>
          <Link href="/" aria-label="Back to Menu">
            <Image src="/back-button.png" alt="Back to Menu" width={120} height={66} className="h-14 w-auto inline-block" />
          </Link>
        </div>
      </div>
    );
  }

  const isPayPalMethod = paymentMethod === "paypal" || paymentMethod === "venmo";

  const isPaypalFormReady =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    customerEmail.trim() !== "" &&
    customerPhone.trim() !== "" &&
    addressLine1.trim() !== "" &&
    city.trim() !== "" &&
    /^\d{5}$/.test(zip.trim()) &&
    lineItems.length > 0 &&
    (fulfillmentType !== "local_delivery" ||
      (city.trim().toLowerCase() === "rapid city" && state === "SD"));

  return (
    <div className="min-h-screen bg-bakery-pattern">
      <CustomerHeader backHref="/" showLogo={false} bannerSrc="/knead_your_dough_banner.png" bannerWidth={1386} bannerHeight={517} />

      <main className="max-w-2xl mx-auto px-4 py-6 pb-12">
        {removedItems.length > 0 && (
          <div className="mb-4 rounded-xl bg-sky-100 border border-sky-300 px-4 py-3 text-sm text-blue-800">
            Some items in your cart are no longer available and were removed.
            <button className="ml-2 underline font-medium" onClick={() => setRemovedItems([])}>Dismiss</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contact Information */}
          <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
            <h2 className={sectionHeaderClass}>Contact Information</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName" className={labelClass}>First Name</label>
                  <input id="firstName" type="text" required value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass} placeholder="Jane" autoComplete="given-name" />
                </div>
                <div>
                  <label htmlFor="lastName" className={labelClass}>Last Name</label>
                  <input id="lastName" type="text" required value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass} placeholder="Smith" autoComplete="family-name" />
                </div>
              </div>
              <div>
                <label htmlFor="customerEmail" className={labelClass}>Email Address</label>
                <input id="customerEmail" type="email" required value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputClass} placeholder="jane@example.com" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="customerPhone" className={labelClass}>Phone Number</label>
                <input id="customerPhone" type="tel" required value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d\s\-().+]/g, ""))}
                  onBlur={(e) => setCustomerPhone(formatPhone(e.target.value))}
                  className={inputClass} placeholder="(605) 555-0100" autoComplete="tel" />
              </div>
            </div>
          </section>

          {/* Fulfillment */}
          <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
            <h2 className={sectionHeaderClass}>Fulfillment</h2>
            <div className="space-y-3 mb-4">
              {([
                { value: "local_delivery", label: "Local Delivery", desc: "Available within the Rapid City, SD area" },
                { value: "shipping", label: "Shipping", desc: "Shipped to your address" },
              ] as { value: FulfillmentType; label: string; desc: string }[]).map((option) => (
                <label key={option.value} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  fulfillmentType === option.value ? "border-purple-800 bg-sky-50" : "border-sky-100 bg-white hover:border-sky-200"}`}>
                  <input type="radio" name="fulfillmentType" value={option.value}
                    checked={fulfillmentType === option.value}
                    onChange={() => {
                      setFulfillmentType(option.value);
                      if (option.value === "shipping" && paymentMethod === "cash") {
                        setPaymentMethod("paypal");
                      }
                    }} className="mt-0.5 accent-purple-800" />
                  <div>
                    <p className="font-semibold text-blue-900">{option.label}</p>
                    <p className="text-xs text-sky-600">{option.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {fulfillmentType === "local_delivery" && (
              <p className="text-xs text-blue-700 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 mb-4">
                Local delivery is available within the Rapid City, SD area
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="addressLine1" className={labelClass}>
                  {fulfillmentType === "local_delivery" ? "Delivery Address" : "Shipping Address"}
                </label>
                <input id="addressLine1" ref={addressCallbackRef} type="text" required
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className={inputClass} placeholder="Start typing your address…" autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="city" className={labelClass}>City</label>
                  <input id="city" type="text" required value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass} placeholder="Rapid City" autoComplete="address-level2" />
                </div>
                <div>
                  <label htmlFor="state" className={labelClass}>State</label>
                  <select id="state" required value={state} onChange={(e) => setState(e.target.value)}
                    className={inputClass} autoComplete="address-level1">
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="zip" className={labelClass}>ZIP Code</label>
                <input id="zip" type="text" required value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  className={inputClass} placeholder="57701" autoComplete="postal-code" maxLength={5} />
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
            <h2 className={sectionHeaderClass}>Payment Method</h2>
            <div className="space-y-3">
              {([
                { value: "venmo", label: "Venmo" },
                { value: "paypal", label: "PayPal / Debit / Credit Card" },
                ...(fulfillmentType === "local_delivery" ? [{ value: "cash" as PaymentMethod, label: "Cash or Check on Delivery" }] : []),
              ] as { value: PaymentMethod; label: string }[]).map((option) => (
                <label key={option.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  paymentMethod === option.value ? "border-purple-800 bg-sky-50" : "border-sky-100 bg-white hover:border-sky-200"}`}>
                  <input type="radio" name="paymentMethod" value={option.value}
                    checked={paymentMethod === option.value}
                    onChange={() => setPaymentMethod(option.value)} className="accent-purple-800" />
                  <span className="font-semibold text-blue-900">{option.label}</span>
                  {option.value === "cash" && (
                    <span className="ml-auto text-xs text-sky-500">Account required</span>
                  )}
                </label>
              ))}
            </div>

            {isCashCheck && clerkLoaded && !isSignedIn && (
              <div className="mt-4 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 space-y-3">
                <p className="text-sm text-blue-800">
                  Cash/Check on delivery requires an account. Admin approval is needed before your first order.
                </p>
                <div className="flex gap-3">
                  <SignInButton mode="modal">
                    <button type="button" className="flex-1 border border-purple-800 text-blue-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-sky-100 transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button type="button" className="flex-1 bg-purple-800 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors">
                      Create Account
                    </button>
                  </SignUpButton>
                </div>
              </div>
            )}

            {isCashCheck && isSignedIn && !cashCheckApproved && (
              <div className="mt-4 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <UserButton />
                  <span className="text-xs text-sky-600">Signed in as {user?.primaryEmailAddress?.emailAddress}</span>
                </div>
                {cashCheckPending || approvalRequested ? (
                  <p className="text-sm text-blue-700 font-medium">
                    Approval Request Pending
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-blue-800 mb-2">
                      Cash/Check payments require admin approval. Request access below.
                    </p>
                    <button
                      type="button"
                      disabled={requestApprovalMutation.isPending}
                      onClick={() => {
                        const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Customer";
                        const email = user?.primaryEmailAddress?.emailAddress ?? "";
                        requestApprovalMutation.mutate({ userId: user!.id, customerName: name, customerEmail: email });
                      }}
                      className="text-sm bg-purple-800 text-white px-4 py-2 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-60 transition-colors"
                    >
                      {requestApprovalMutation.isPending ? "Sending..." : "Request Approval"}
                    </button>
                  </>
                )}
              </div>
            )}

            {isCashCheck && isSignedIn && cashCheckApproved && (
              <div className="mt-4 flex items-center gap-2">
                <UserButton />
                <span className="text-xs text-sky-600">Signed in as {user?.primaryEmailAddress?.emailAddress}</span>
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
            <h2 className={sectionHeaderClass}>Order Notes (Optional)</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Any special requests or notes..." />
          </section>

          {/* Order Review */}
          <section className="bg-white rounded-3xl shadow-sm border border-sky-100 p-4">
            <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl">
              <p className="text-sm font-bold text-blue-900 mb-1">DISCLAIMER:</p>
              <p className="text-xs text-blue-800 leading-relaxed">
                This product was not produced in a commercial kitchen. It has been home-processed
                in a kitchen that may also process common food allergens such as tree nuts,
                peanuts, eggs, soy, wheat, milk, fish, and crustacean shellfish.
              </p>
            </div>
            <h2 className={sectionHeaderClass}>Order Review</h2>
            <div className="space-y-3 mb-4">
              {lineItems.map(({ product, quantity, subtotal }) => (
                <div key={product.id} className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-blue-900">{product.name}</p>
                    <p className="text-xs text-sky-500">
                      {quantity} × {product.unitLabel} @ ${Number(product.price).toFixed(2)}
                    </p>
                  </div>
                  <span className="font-semibold text-blue-900">${subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-sky-100 pt-3 flex justify-between items-center">
              <span className="font-semibold text-blue-900">Total</span>
              <span className="text-xl font-bold text-blue-900">${grandTotal.toFixed(2)}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-sky-100 space-y-1 text-sm text-blue-700">
              <p>
                <span className="font-medium">Fulfillment:</span>{" "}
                {fulfillmentType === "local_delivery" ? "Local Delivery" : "Shipping"}
                {addressLine1 && ` — ${addressLine1}, ${city}, ${state} ${zip}`}
              </p>
              <p>
                <span className="font-medium">Payment:</span>{" "}
                {paymentMethod === "venmo" ? "Venmo" : paymentMethod === "paypal" ? "PayPal"
                  : paymentMethod === "cash" ? "Cash on Delivery" : "Check on Delivery"}
              </p>
            </div>
          </section>

          {/* Error */}
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {formError}
            </div>
          )}

          {/* Submit / PayPal buttons */}
          {isPayPalMethod ? (
            <div className="relative">
              {!isPaypalFormReady && (
                <div
                  className="absolute inset-0 z-10 cursor-pointer"
                  onClick={() => { setFormError(null); validate(); }}
                />
              )}
            <PayPalButtons
              style={{ layout: "vertical", label: "pay" }}
              fundingSource={paymentMethod === "venmo" ? "venmo" : undefined}
              createOrder={async () => {
                setFormError(null);
                if (!validate()) throw new Error("validation");
                try {
                  const result = await createPaypalOrderMutation.mutateAsync(collectFormData());
                  pendingOrderRef.current = result;
                  return result.paypalOrderId;
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Unknown error";
                  setFormError(`PayPal error: ${msg}`);
                  throw err;
                }
              }}
              onApprove={async () => {
                if (!pendingOrderRef.current) return;
                await capturePaypalOrderMutation.mutateAsync(pendingOrderRef.current);
              }}
              onError={(err) => {
                if (err instanceof Error && err.message === "validation") return;
                if (!createPaypalOrderMutation.isError) {
                  setFormError("Something went wrong with PayPal. Please try again.");
                }
              }}
            />
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitMutation.isPending || (isCashCheck && (!isSignedIn || !cashCheckApproved))}
              className="w-full bg-purple-800 text-white px-4 py-3 rounded-xl font-semibold hover:bg-purple-700 active:bg-purple-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitMutation.isPending ? "Placing Order..." : "Place Order"}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}

export function OrderFormClient({ products }: OrderFormClientProps) {
  return (
    <CartProvider>
      <PayPalScriptProvider options={{
        clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
        currency: "USD",
        components: "buttons",
        enableFunding: "venmo,card",
      }}>
        <OrderFormInner products={products} />
      </PayPalScriptProvider>
    </CartProvider>
  );
}
