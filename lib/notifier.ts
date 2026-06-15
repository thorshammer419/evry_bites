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

export type OrderEvent =
  | { type: "order.received"; order: OrderReceivedForNotification }
  | { type: "order.status_changed"; order: OrderForNotification; newStatus: OrderStatus };

export interface Notifier {
  notify(event: OrderEvent): Promise<void>;
}
