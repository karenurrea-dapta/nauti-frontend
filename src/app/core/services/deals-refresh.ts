import { Injectable, signal } from '@angular/core';

// Lets the assistant chat tell deal lists to reload after the engine
// registers a new operation, without coupling the components.
@Injectable({ providedIn: 'root' })
export class DealsRefresh {
  readonly version = signal(0);

  refresh(): void {
    this.version.update((value) => value + 1);
  }
}
