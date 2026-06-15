import type { Notifier, OrderEvent } from "./notifier";

export class NullNotifier implements Notifier {
  async notify(_event: OrderEvent): Promise<void> {}
}
