/**
 * LinkedIn Acceptance Enrichment
 *
 * Fetches unread LinkedIn acceptance emails, extracts profile URLs,
 * and cross-references with FOCUS to provide enriched contact info
 * including pre-configured outreach messages.
 */

import type { GoogleGmailClient } from "../integrations/gmail.js";
import type { FocusClient, FocusContact, FocusMessage, FocusOutreachRecord } from "../integrations/focus.js";
import { GMAIL_ACCOUNTS } from "../integrations/gmail.js";

export interface LinkedInAcceptance {
  readonly name: string;
  readonly linkedinUrl: string | null;
  readonly date: string;
  readonly accountId: string;
  /** FOCUS contact info, if found */
  readonly focus: {
    readonly contactId: number;
    readonly title: string | null;
    readonly companyName: string | null;
    readonly companyDescription: string | null;
    readonly outreachStatus: string | null;
    readonly outreachId: number | null;
    readonly message: string | null;
  } | null;
}

const PROFILE_URL_RE = /https?:\/\/[a-z.]*linkedin\.com\/comm\/in\/([^?"&\s]+)/;

function extractProfileUrl(html: string): string | null {
  const match = html.match(PROFILE_URL_RE);
  if (!match) return null;
  return `https://www.linkedin.com/in/${match[1]}`;
}

function extractName(from: string): string {
  return from
    .replace(/ via LinkedIn.*$/i, "")
    .replace(/^"/, "")
    .replace(/"$/, "")
    .trim();
}

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
}

async function enrichFromFocus(
  focus: FocusClient,
  linkedinUrl: string | null,
  name: string,
): Promise<LinkedInAcceptance["focus"]> {
  if (!focus.isConfigured) return null;

  try {
    // Search by name first, then try LinkedIn slug as fallback
    const cleanName = name.replace(/,\s*(PhD|CFA|MBA|CPA|PE|MD)$/i, "").trim();
    let contacts = await focus.searchContacts(cleanName, true);

    // If no results by name, try searching by LinkedIn slug
    if (contacts.length === 0 && linkedinUrl) {
      const slug = linkedinUrl.replace(/.*\/in\//, "").replace(/\/+$/, "");
      contacts = await focus.searchContacts(slug, true);
    }

    // Try to match by LinkedIn URL first, then fall back to first result
    let contact: FocusContact | undefined;
    if (linkedinUrl) {
      const normalized = linkedinUrl.toLowerCase().replace(/\/+$/, "");
      contact = contacts.find(
        (c) => c.linkedin_url?.toLowerCase().replace(/\/+$/, "") === normalized,
      );
    }
    if (!contact && contacts.length > 0) {
      contact = contacts[0];
    }
    if (!contact) return null;

    // Fetch company, outreach, and messages in parallel
    const [companyResult, outreachRecords, messages] = await Promise.all([
      contact.company_id
        ? focus.getCompany(contact.company_id).catch(() => null)
        : Promise.resolve(null),
      focus.getOutreach({
        employeeId: contact.id,
        platform: "linkedin",
      }).catch(() => [] as FocusOutreachRecord[]),
      focus.getMessages({
        employeeId: contact.id,
        platform: "linkedin",
      }).catch(() => [] as FocusMessage[]),
    ]);

    // Pick the most relevant outreach record (waiting > active > any)
    const outreach = outreachRecords.find((r) => r.current_status === "waiting")
      ?? outreachRecords.find((r) => r.current_status === "active")
      ?? outreachRecords[0]
      ?? null;

    // Pick the latest draft message
    const draftMessage = messages.find((m) => m.status === "draft")
      ?? messages[0]
      ?? null;

    return {
      contactId: contact.id,
      title: contact.title,
      companyName: companyResult?.name ?? null,
      companyDescription: truncate(companyResult?.description, 100),
      outreachStatus: outreach?.current_status ?? null,
      outreachId: outreach?.id ?? null,
      message: draftMessage?.message ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchLinkedInAcceptances(
  gmail: GoogleGmailClient,
  focus: FocusClient,
): Promise<LinkedInAcceptance[]> {
  const acceptances: LinkedInAcceptance[] = [];

  for (const account of GMAIL_ACCOUNTS) {
    const result = await gmail.listMessages(account.id, {
      query: "from:invitations@linkedin.com is:unread",
      maxResults: 20,
      includeBody: false,
    });

    if (result.warning || result.messages.length === 0) continue;

    // Fetch full body for each to extract profile URLs
    const enrichments = await Promise.all(
      result.messages.map(async (msg) => {
        const full = await gmail.getMessage(account.id, msg.id);
        const linkedinUrl = extractProfileUrl(full.htmlBody ?? "");
        const name = extractName(msg.from);
        const focusInfo = await enrichFromFocus(focus, linkedinUrl, name);

        return {
          name,
          linkedinUrl,
          date: msg.date,
          accountId: account.id,
          focus: focusInfo,
        };
      }),
    );

    acceptances.push(...enrichments);
  }

  return acceptances;
}

export function formatLinkedInAcceptances(acceptances: readonly LinkedInAcceptance[]): string {
  if (acceptances.length === 0) return "(no new LinkedIn acceptances)";

  const lines: string[] = [];
  lines.push(`${acceptances.length} new connection(s) accepted:\n`);

  for (const a of acceptances) {
    const f = a.focus;
    if (f) {
      const role = [f.title, f.companyName].filter(Boolean).join(" @ ");
      const roleStr = role ? ` — ${truncate(role, 60)}` : "";
      const status = f.outreachStatus ? ` [${f.outreachStatus}]` : "";
      lines.push(`- **${a.name}**${roleStr}${status}`);
      if (a.linkedinUrl) lines.push(`  ${a.linkedinUrl}`);
      if (f.companyDescription) lines.push(`  Company: ${f.companyDescription}`);
      if (f.message) {
        const preview = truncate(f.message, 120);
        lines.push(`  Draft msg: "${preview}"`);
      }
    } else {
      lines.push(`- **${a.name}** (not in FOCUS)`);
      if (a.linkedinUrl) lines.push(`  ${a.linkedinUrl}`);
    }
  }

  return lines.join("\n");
}
