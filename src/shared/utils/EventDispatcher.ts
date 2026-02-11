import { DomainEvent, EventHandler } from '../types';

export class EventDispatcher {
  private static instance: EventDispatcher;
  private handlers: Map<string, EventHandler[]> = new Map();

  private constructor() {}

  static getInstance(): EventDispatcher {
    if (!EventDispatcher.instance) {
      EventDispatcher.instance = new EventDispatcher();
    }
    return EventDispatcher.instance;
  }

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }

  async dispatch<T extends DomainEvent>(
    eventName: string,
    event: T,
  ): Promise<void> {
    const eventHandlers = this.handlers.get(eventName) || [];
    await Promise.all(eventHandlers.map((handler) => handler(event)));
  }

  unsubscribe(eventName: string, handler: EventHandler): void {
    if (!this.handlers.has(eventName)) return;
    const handlers = this.handlers.get(eventName)!;
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const eventDispatcher = EventDispatcher.getInstance();
