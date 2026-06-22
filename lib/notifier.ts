import type { FulfillmentType, OrderStatus } from "@prisma/client";

export interface OrderForNotification {
  id: string;
  firstName: string | null;
  lastName: string | null;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  totalAmount: unknown;
}

export interface OrderItemForNotification {
  quantity: number;
  unitPrice: unknown;
  product: { name: string; unitLabel: string };
}

export interface OrderReceivedForNotification extends OrderForNotification {
  paymentMethod: string;
  orderItems: OrderItemForNotification[];
}

export interface CashCheckRequestForNotification {
  userId: string;
  customerName: string;
  customerEmail: string;
  approveUrl: string;
  denyUrl: string;
}

export type OrderEvent =
  | { type: "order.received"; order: OrderReceivedForNotification }
  | { type: "order.payment_received"; order: OrderReceivedForNotification }
  | { type: "order.status_changed"; order: OrderForNotification; newStatus: OrderStatus }
  | { type: "order.cancelled"; order: OrderForNotification; reason?: string }
  | { type: "order.venmo_payment_requested"; order: OrderForNotification & { totalAmount: unknown } }
  | { type: "order.paypal_payment_requested"; order: OrderForNotification & { totalAmount: unknown }; paymentUrl: string }
  | { type: "user.cash_check_requested"; request: CashCheckRequestForNotification };

export interface Notifier {
  notify(event: OrderEvent): Promise<void>;
}
