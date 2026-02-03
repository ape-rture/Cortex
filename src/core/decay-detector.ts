import type { ContactStore, DecayAlert, DecayConfig, DecayDetector } from "./types/crm.js";
import { DEFAULT_DECAY_CONFIG } from "./types/crm.js";

function daysBetween(dateIso: string, now = new Date()): number {
  const then = new Date(dateIso);
  if (Number.isNaN(then.getTime())) return 0;
  const deltaMs = now.getTime() - then.getTime();
  return Math.floor(deltaMs / (1000 * 60 * 60 * 24));
}

export class SimpleDecayDetector implements DecayDetector {
  private readonly store: ContactStore;

  constructor(store: ContactStore) {
    this.store = store;
  }

  async detectDecay(config: Partial<DecayConfig> = {}): Promise<readonly DecayAlert[]> {
    const cfg: DecayConfig = { ...DEFAULT_DECAY_CONFIG, ...config };
    const contacts = await this.store.loadAll();

    const alerts = contacts
      .filter((contact) => cfg.monitoredTypes.includes(contact.type))
      .map((contact) => {
        if (!contact.lastContact) return undefined;
        const daysSinceContact = daysBetween(contact.lastContact);
        if (daysSinceContact < cfg.thresholdDays) return undefined;
        const lastTopic = contact.history[0]?.summary;
        return {
          contact,
          daysSinceContact,
          lastTopic,
          suggestedAction: `Follow up with ${contact.name}`,
        } as DecayAlert;
      })
      .filter((item): item is DecayAlert => Boolean(item))
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact)
      .slice(0, cfg.maxAlerts);

    return alerts;
  }
}
