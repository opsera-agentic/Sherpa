import type { BaseAdapter } from './base-adapter.js';
import type { AdapterMetadata } from './types.js';

export class AdapterRegistry {
  private readonly adapters = new Map<string, BaseAdapter>();

  register(name: string, adapter: BaseAdapter): void {
    this.adapters.set(name, adapter);
  }

  get(name: string): BaseAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): AdapterMetadata[] {
    return [...this.adapters.values()].map((a) => a.metadata);
  }

  /** Registered adapter ids including aliases resolved via registration keys. */
  names(): string[] {
    return [...this.adapters.keys()];
  }
}
