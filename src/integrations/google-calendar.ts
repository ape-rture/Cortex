import { google } from "googleapis";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  htmlLink?: string;
}

export interface CalendarFetchResult {
  events: CalendarEvent[];
  warning?: string;
  sources?: string[];
}

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function getTodayBounds(timeZone: string): { start: string; end: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const start = new Date(`${year}-${month}-${day}T00:00:00`);
  const end = new Date(`${year}-${month}-${day}T23:59:59`);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function fetchTodayEvents(options?: {
  calendarId?: string;
  calendarIds?: string[];
  timeZone?: string;
  maxResults?: number;
}): Promise<CalendarFetchResult> {
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = getEnv("GOOGLE_REFRESH_TOKEN");
  const redirectUri = getEnv("GOOGLE_REDIRECT_URI") ?? "http://localhost";
  const envCalendarIds = getEnv("GOOGLE_CALENDAR_IDS");
  const parsedEnvIds = envCalendarIds
    ? envCalendarIds.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  const calendarIds = options?.calendarIds
    ?? (options?.calendarId ? [options.calendarId] : undefined)
    ?? (parsedEnvIds.length > 0 ? parsedEnvIds : undefined)
    ?? [getEnv("GOOGLE_CALENDAR_ID") ?? "primary"];
  const timeZone = options?.timeZone ?? getEnv("GOOGLE_TIMEZONE") ?? "UTC";

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      events: [],
      warning: "Google Calendar credentials missing (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).",
      sources: calendarIds,
    };
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const { start, end } = getTodayBounds(timeZone);

  const eventsByKey = new Map<string, CalendarEvent>();
  for (const calendarId of calendarIds) {
    const response = await calendar.events.list({
      calendarId,
      timeMin: start,
      timeMax: end,
      maxResults: options?.maxResults ?? 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    const items = response.data.items ?? [];
    for (const item of items) {
      if (!item.id || !item.start || !item.end) continue;
      const startTime = item.start?.dateTime ?? item.start?.date ?? "";
      const endTime = item.end?.dateTime ?? item.end?.date ?? "";
      const key = `${startTime}-${endTime}-${item.summary ?? ""}`;
      if (eventsByKey.has(key)) continue;
      eventsByKey.set(key, {
        id: item.id,
        summary: item.summary ?? "(no title)",
        start: startTime,
        end: endTime,
        location: item.location ?? undefined,
        htmlLink: item.htmlLink ?? undefined,
      });
    }
  }

  const events = Array.from(eventsByKey.values()).sort((a, b) => a.start.localeCompare(b.start));
  return { events, sources: calendarIds };
}
