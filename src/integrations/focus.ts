/**
 * FOCUS Lead Gen System — Agent API client
 *
 * Lightweight HTTP client for the FOCUS Agent API v1.
 * Used by /gm to cross-reference LinkedIn acceptances with outreach data.
 */

export interface FocusContact {
  readonly id: number;
  readonly company_id: number | null;
  readonly full_name: string;
  readonly email: string | null;
  readonly linkedin_url: string | null;
  readonly title: string | null;
  readonly source: string | null;
}

export interface FocusCompany {
  readonly id: number;
  readonly name: string;
  readonly domain: string | null;
  readonly description: string | null;
  readonly industry: string | null;
  readonly funding_stage: string | null;
  readonly linkedin_url: string | null;
}

export interface FocusOutreachRecord {
  readonly id: number;
  readonly campaign_id: number | null;
  readonly company_id: number | null;
  readonly company_name: string | null;
  readonly employee_id: number | null;
  readonly employee_name: string | null;
  readonly employee_linkedin: string | null;
  readonly platform: string;
  readonly current_status: string;
  readonly priority: string | null;
  readonly notes: string | null;
}

export interface FocusMessage {
  readonly id: number;
  readonly company_id: number | null;
  readonly employee_id: number | null;
  readonly campaign_id: number | null;
  readonly platform: string;
  readonly message: string;
  readonly status: string;
}

type ApiResponse<T> = { ok: true; data: T } | { detail: string };

export class FocusClient {
  private readonly baseUrl: string;
  private readonly agentKey: string;

  constructor(baseUrl?: string, agentKey?: string) {
    this.baseUrl = (baseUrl ?? process.env.FOCUS_API_URL ?? "").replace(/\/+$/, "");
    this.agentKey = agentKey ?? process.env.FOCUS_AGENT_KEY ?? "";
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.agentKey.length > 0;
  }

  async searchContacts(query: string, hasLinkedin?: boolean): Promise<FocusContact[]> {
    const params = new URLSearchParams({ q: query, limit: "10" });
    if (hasLinkedin) params.set("has_linkedin", "true");
    return this.get<FocusContact[]>(`/agent/v1/contacts?${params}`);
  }

  async getContact(id: number): Promise<FocusContact> {
    return this.get<FocusContact>(`/agent/v1/contacts/${id}`);
  }

  async getCompany(id: number): Promise<FocusCompany> {
    return this.get<FocusCompany>(`/agent/v1/companies/${id}`);
  }

  async getOutreach(params: {
    employeeId?: number;
    platform?: string;
    status?: string;
  }): Promise<FocusOutreachRecord[]> {
    const search = new URLSearchParams();
    if (params.employeeId != null) search.set("employee_id", String(params.employeeId));
    if (params.platform) search.set("platform", params.platform);
    if (params.status) search.set("status", params.status);
    search.set("limit", "5");
    return this.get<FocusOutreachRecord[]>(`/agent/v1/outreach?${search}`);
  }

  async getMessages(params: {
    employeeId?: number;
    platform?: string;
  }): Promise<FocusMessage[]> {
    const search = new URLSearchParams();
    if (params.employeeId != null) search.set("employee_id", String(params.employeeId));
    if (params.platform) search.set("platform", params.platform);
    search.set("limit", "3");
    return this.get<FocusMessage[]>(`/agent/v1/messages?${search}`);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { "X-Agent-Key": this.agentKey },
    });
    const json = (await response.json()) as ApiResponse<T>;
    if ("detail" in json) throw new Error(json.detail);
    return json.data;
  }
}
