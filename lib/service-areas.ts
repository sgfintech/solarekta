export function parseServiceAreas(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, 12) : [];
  } catch {
    return [];
  }
}
