/**
 * CRM Types
 *
 * Types for contact management, relationship tracking, and CRM sync.
 * Based on contacts/_template.md and Phase 2 roadmap.
 */

// ---------------------------------------------------------------------
// Contact types
// ---------------------------------------------------------------------

/**
 * Classification of a contact.
 */
export type ContactType = "customer" | "lead" | "partner" | "investor" | "other";

/**
 * Relationship health status.
 */
export type RelationshipStatus = "active" | "nurturing" | "dormant" | "churned";

/**
 * Contact information.
 */
export interface ContactInfo {
  readonly email?: string;
  readonly linkedin?: string;
  readonly phone?: string;
}

/**
 * Type of interaction with a contact.
 */
export type InteractionType = "meeting" | "email" | "call" | "slack" | "telegram" | "other";

/**
 * A single interaction record from the contact's history.
 */
export interface InteractionRecord {
  /** ISO-8601 date of the interaction */
  readonly date: string;

  /** Type of interaction */
  readonly type: InteractionType;

  /** Brief summary of what was discussed */
  readonly summary: string;

  /** Key points from the interaction */
  readonly keyPoints?: readonly string[];

  /** Any follow-up action needed */
  readonly followUpNeeded?: string;
}

/**
 * A contact record, parsed from contacts/*.md files.
 */
export interface Contact {
  /** Name from markdown H1 header */
  readonly name: string;

  /** Company name */
  readonly company?: string;

  /** Role/title */
  readonly role?: string;

  /** Contact classification */
  readonly type: ContactType;

  /** Attio record ID (if linked to CRM) */
  readonly attioId?: string;

  /** Contact information (email, linkedin, phone) */
  readonly contactInfo?: ContactInfo;

  /** Who they are, how we know them, their situation */
  readonly context?: string;

  /** Relationship health status */
  readonly relationshipStatus: RelationshipStatus;

  /** ISO-8601 date of last interaction */
  readonly lastContact?: string;

  /** Scheduled next follow-up date */
  readonly nextFollowUp?: string;

  /** Interaction history (newest first) */
  readonly history: readonly InteractionRecord[];

  /** Free-form notes */
  readonly notes?: string;

  /** File path relative to project root */
  readonly filePath: string;
}

// ---------------------------------------------------------------------
// Relationship decay
// ---------------------------------------------------------------------

/**
 * An alert for a contact that hasn't been contacted recently.
 */
export interface DecayAlert {
  /** The contact that needs attention */
  readonly contact: Contact;

  /** Days since last interaction */
  readonly daysSinceContact: number;

  /** Summary of the last interaction topic */
  readonly lastTopic?: string;

  /** Suggested action to take */
  readonly suggestedAction: string;
}

/**
 * Configuration for decay detection.
 */
export interface DecayConfig {
  /** Days without contact before flagging (default: 30) */
  readonly thresholdDays: number;

  /** Contact types to monitor (default: ["customer", "lead"]) */
  readonly monitoredTypes: readonly ContactType[];

  /** Maximum alerts to return (default: 10) */
  readonly maxAlerts: number;
}

/**
 * Default decay detection configuration.
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  thresholdDays: 30,
  monitoredTypes: ["customer", "lead"],
  maxAlerts: 10,
};

// ---------------------------------------------------------------------
// Meeting prep
// ---------------------------------------------------------------------

/**
 * A one-page brief for preparing for a meeting.
 */
export interface MeetingPrepBrief {
  /** The contact this brief is about */
  readonly contact: Contact;

  /** Recent interactions (last 5) */
  readonly recentInteractions: readonly InteractionRecord[];

  /** Open action items involving this contact */
  readonly openActionItems: readonly string[];

  /** LLM-generated talking point suggestions */
  readonly suggestedTalkingPoints: readonly string[];

  /** Summary of the relationship context */
  readonly contextSummary: string;

  /** ISO-8601 timestamp when brief was generated */
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------
// Contact store interface
// ---------------------------------------------------------------------

/**
 * Interface for loading and saving contact files.
 */
export interface ContactStore {
  /** Load all contacts from contacts/ directory */
  loadAll(): Promise<readonly Contact[]>;

  /** Load a single contact by file path */
  load(filePath: string): Promise<Contact>;

  /** Save a contact (creates or updates file) */
  save(contact: Contact): Promise<void>;

  /** Find contact by Attio ID */
  findByAttioId(attioId: string): Promise<Contact | undefined>;

  /** Find contact by email */
  findByEmail(email: string): Promise<Contact | undefined>;

  /** Search contacts by name or company (case-insensitive) */
  search(query: string): Promise<readonly Contact[]>;

  /** Add an interaction to a contact's history */
  addInteraction(filePath: string, interaction: InteractionRecord): Promise<void>;
}

// ---------------------------------------------------------------------
// Decay detector interface
// ---------------------------------------------------------------------

/**
 * Interface for detecting relationship decay.
 */
export interface DecayDetector {
  /** Scan all contacts and return decay alerts */
  detectDecay(config?: Partial<DecayConfig>): Promise<readonly DecayAlert[]>;
}

// ---------------------------------------------------------------------
// Meeting prep generator interface
// ---------------------------------------------------------------------

/**
 * Configuration for meeting prep generation.
 */
export interface MeetingPrepConfig {
  /** Maximum recent interactions to include (default: 5) */
  readonly maxInteractions: number;

  /** Whether to call LLM for talking points (default: true) */
  readonly generateTalkingPoints: boolean;
}

/**
 * Default meeting prep configuration.
 */
export const DEFAULT_MEETING_PREP_CONFIG: MeetingPrepConfig = {
  maxInteractions: 5,
  generateTalkingPoints: true,
};

/**
 * Interface for generating meeting prep briefs.
 */
export interface MeetingPrepGenerator {
  /**
   * Generate a meeting prep brief for a contact.
   * @param query Contact name or identifier to search for
   * @param config Optional configuration
   */
  generateBrief(query: string, config?: Partial<MeetingPrepConfig>): Promise<MeetingPrepBrief>;
}
