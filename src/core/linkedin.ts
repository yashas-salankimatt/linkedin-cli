import type { Page } from "playwright";
import { logger } from "../utils/logger.js";
import { randomDelay, randomScrollPixels } from "../utils/delay.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NETWORK_TO_LINKEDIN_CODE: Record<"1" | "2" | "3", string> = {
  "1": "F",
  "2": "S",
  "3": "O"
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchPeopleFilters {
  keywords: string;
  network: Array<"1" | "2" | "3">;
  location?: string;
  limit: number;
}

export interface SearchPersonResult {
  name: string;
  headline: string;
  location: string;
  connectionDegree: string;
  profileUrl: string;
}

export interface ProfileResult {
  profileUrl: string;
  name: string;
  headline: string;
  location: string;
  about: string;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  dateRange: string;
  location: string;
  description: string;
}

export interface EducationEntry {
  school: string;
  degree: string;
  fieldOfStudy: string;
  dateRange: string;
}

export interface DetailedProfileResult extends ProfileResult {
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
}

export interface PostResult {
  text: string;
  postUrl: string;
  postedAt: string;
  reactionCount: string;
  commentCount: string;
}

export interface MutualConnectionResult {
  name: string;
  headline: string;
  location: string;
  connectionDegree: string;
  profileUrl: string;
}

export interface WarmIntroPathResult {
  score: number;
  rationale: string[];
  sourceProfileUrl: string;
  via: MutualConnectionResult;
  targetProfileUrl: string;
  targetName: string;
  path: [string, string, string];
}

export interface WarmIntroTargetContext {
  profileUrl: string;
  name: string;
  headline: string;
  location: string;
}

export interface CompanyResult {
  companyUrl: string;
  name: string;
  industry: string;
  size: string;
  headquarters: string;
  founded: string;
  about: string;
  specialties: string;
  website: string;
}

export interface JobResult {
  title: string;
  company: string;
  location: string;
  postedAt: string;
  jobUrl: string;
  workplace: string;
}

export interface SearchJobsFilters {
  keywords: string;
  location?: string;
  remote?: boolean;
  limit: number;
}

export interface MessageThread {
  participantName: string;
  lastMessage: string;
  timestamp: string;
  threadUrl: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ParsedCardText {
  name: string;
  headline: string;
  location: string;
}

interface RawPeopleCard {
  name: string;
  headline: string;
  location: string;
  connectionDegreeText: string;
  profileUrl: string;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function assertLinkedInUrl(url: string): void {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) {
      throw new Error(`URL is not a LinkedIn URL: ${url}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("URL is not")) {
      throw err;
    }
    throw new Error(`Invalid URL: ${url}`);
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function buildPeopleSearchUrl(filters: SearchPeopleFilters): string {
  const url = new URL("https://www.linkedin.com/search/results/people/");
  const params = url.searchParams;

  const keywordParts = [filters.keywords.trim()];
  if (filters.location) {
    keywordParts.push(filters.location.trim());
  }

  params.set("keywords", keywordParts.join(" "));

  const networkCodes = filters.network.map((item) => NETWORK_TO_LINKEDIN_CODE[item]);
  if (networkCodes.length > 0) {
    params.set("network", JSON.stringify(networkCodes));
  }

  params.set("origin", "GLOBAL_SEARCH_HEADER");
  return url.toString();
}

function normalizeProfileUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, "https://www.linkedin.com");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    logger.debug(`Failed to parse URL: ${value}`);
    return "";
  }
}

function toCanonicalProfileUrl(value: string): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, "https://www.linkedin.com");
    const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
    if (!match) {
      return normalizeProfileUrl(value);
    }
    return `https://www.linkedin.com/in/${match[1]}/`;
  } catch {
    return "";
  }
}

function toCanonicalCompanyUrl(value: string): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value, "https://www.linkedin.com");
    const match = url.pathname.match(/^\/company\/([^/?#]+)/i);
    if (!match) {
      return normalizeProfileUrl(value);
    }
    return `https://www.linkedin.com/company/${match[1]}/`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Text parsing
// ---------------------------------------------------------------------------

function inferDegree(raw: string): string {
  const shortOrdinalMatch = raw.match(/([123](?:st|nd|rd)\+?)(?=\s|$|[A-Z])/i);
  if (shortOrdinalMatch) {
    const normalized = shortOrdinalMatch[1].toLowerCase();
    if (normalized.startsWith("1")) {
      return "1st";
    }
    if (normalized.startsWith("2")) {
      return "2nd";
    }
    return "3rd";
  }

  const ordinalMatch = raw.match(/\b([123](?:st|nd|rd))\s+degree\b/i);
  if (ordinalMatch) {
    return ordinalMatch[1].toLowerCase();
  }

  const match = raw.match(/\b([123])\s+degree\b/i);
  if (!match) {
    return "unknown";
  }

  const degree = match[1];
  if (degree === "1") {
    return "1st";
  }
  if (degree === "2") {
    return "2nd";
  }
  return "3rd";
}

function parseSearchCardText(raw: string): ParsedCardText {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { name: "", headline: "", location: "" };
  }

  const noisePrefixes = ["past:", "current:", "mutual", "shared", "see all", "show all", "view", "message", "follow", "connect", "pending"];

  const isNoise = (value: string): boolean => {
    const lower = value.toLowerCase();
    if (lower === "\u2022") {
      return true;
    }
    return noisePrefixes.some((prefix) => lower.startsWith(prefix));
  };

  const name = lines[0]
    .replace(/^\u2022\s*/, "")
    .replace(/\s*[\u2022\u00B7]?\s*(?:1st|2nd|3rd\+?)$/i, "")
    .trim();

  const candidateDetails = lines.slice(1).filter((line) => {
    if (line.startsWith("\u2022")) {
      return false;
    }
    if (/(?:^| )(?:1st|2nd|3rd\+?)(?:$| )/i.test(line)) {
      return false;
    }
    return !isNoise(line);
  });

  const headline = candidateDetails[0] ?? "";
  const location = candidateDetails[1] ?? "";

  return { name, headline, location };
}

// ---------------------------------------------------------------------------
// Raw card scraping & conversion
// ---------------------------------------------------------------------------

function rawPeopleCardsToResults(rawResults: RawPeopleCard[]): SearchPersonResult[] {
  return rawResults
    .filter((item) => item.profileUrl)
    .map((item) => {
      const parsedText = parseSearchCardText(item.connectionDegreeText);
      const name = item.name || parsedText.name;
      const headline = item.headline || parsedText.headline;
      const location = item.location || parsedText.location;

      return {
        name,
        headline,
        location,
        connectionDegree: inferDegree(item.connectionDegreeText),
        profileUrl: toCanonicalProfileUrl(item.profileUrl)
      };
    })
    .filter((item) => item.name && item.profileUrl);
}

async function scrapeRawPeopleCards(page: Page): Promise<RawPeopleCard[]> {
  const modernCards = await page
    .evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-view-name='people-search-result']"));
      if (cards.length === 0) {
        return [];
      }

      return cards.map((card) => {
        const anchor = card.querySelector<HTMLAnchorElement>("a[href*='/in/']");

        return {
          name: "",
          headline: "",
          location: "",
          connectionDegreeText: card.innerText ?? card.textContent ?? "",
          profileUrl: anchor?.href ?? ""
        };
      });
    })
    .catch((err) => {
      logger.debug(`Modern card selector failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });

  if (modernCards.length > 0) {
    return modernCards;
  }

  return page
    .evaluate(() => {
      const cards = Array.from(document.querySelectorAll("li.reusable-search__result-container"));

      return cards.map((card) => {
        const anchor = card.querySelector<HTMLAnchorElement>("a.app-aware-link[href*='/in/']");
        const nameText = card.querySelector<HTMLElement>("span.entity-result__title-text span[aria-hidden='true']")?.innerText;
        const fallbackName = card.querySelector<HTMLElement>("a span[aria-hidden='true']")?.innerText;
        const headline = card.querySelector<HTMLElement>(".entity-result__primary-subtitle")?.innerText ?? "";
        const location = card.querySelector<HTMLElement>(".entity-result__secondary-subtitle")?.innerText ?? "";
        const entireText = card.textContent ?? "";

        return {
          name: (nameText ?? fallbackName ?? "").trim(),
          headline: headline.trim(),
          location: location.trim(),
          connectionDegreeText: entireText,
          profileUrl: anchor?.href ?? ""
        };
      });
    })
    .catch((err) => {
      logger.debug(`Legacy card selector failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

async function collectPeopleResultsByPageNumber(
  page: Page,
  startUrl: string,
  limit: number,
  maxPages: number = 30
): Promise<SearchPersonResult[]> {
  const seen = new Map<string, SearchPersonResult>();
  const baseUrl = new URL(startUrl);
  baseUrl.hash = "";
  baseUrl.searchParams.delete("page");
  let emptyPageStreak = 0;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl = new URL(baseUrl.toString());
    if (pageNumber > 1) {
      pageUrl.searchParams.set("page", String(pageNumber));
    }

    logger.debug(`Navigating to search page ${pageNumber}...`);
    await page.goto(pageUrl.toString(), { waitUntil: "domcontentloaded" });
    await randomDelay(800, 1500);
    await page
      .waitForSelector("[data-view-name='people-search-result'], li.reusable-search__result-container", {
        timeout: 7000
      })
      .catch(() => {
        logger.debug(`No search result selectors found on page ${pageNumber}`);
      });

    let rawCards = await scrapeRawPeopleCards(page);
    if (rawCards.length === 0) {
      await randomDelay(1000, 1800);
      rawCards = await scrapeRawPeopleCards(page);
    }

    const parsed = rawPeopleCardsToResults(rawCards);
    logger.debug(`Page ${pageNumber}: found ${parsed.length} results`);

    if (parsed.length === 0) {
      emptyPageStreak += 1;
      if (emptyPageStreak >= 2) {
        logger.debug("Two consecutive empty pages, stopping pagination.");
        break;
      }
      continue;
    }

    emptyPageStreak = 0;
    for (const person of parsed) {
      if (!seen.has(person.profileUrl)) {
        seen.set(person.profileUrl, person);
      }
    }

    if (seen.size >= limit) {
      break;
    }
  }

  return Array.from(seen.values()).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Token-based similarity scoring
// ---------------------------------------------------------------------------

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function sharedTokenCount(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  let count = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Warm intro path building
// ---------------------------------------------------------------------------

export function buildWarmIntroPathsFromMutuals(args: {
  sourceProfileUrl: string;
  target: WarmIntroTargetContext;
  mutuals: MutualConnectionResult[];
}): WarmIntroPathResult[] {
  const { sourceProfileUrl, target, mutuals } = args;

  const scored = mutuals.map((mutual) => {
    let score = 40;
    const rationale: string[] = [];

    if (mutual.connectionDegree.startsWith("1")) {
      score += 30;
      rationale.push("Mutual appears as a first-degree connection.");
    } else if (mutual.connectionDegree.startsWith("2")) {
      score += 15;
      rationale.push("Mutual appears as a second-degree connection.");
    } else {
      rationale.push("Connection degree is not explicit.");
    }

    const sharedHeadline = sharedTokenCount(mutual.headline, target.headline);
    if (sharedHeadline > 0) {
      const bonus = Math.min(20, sharedHeadline * 4);
      score += bonus;
      rationale.push(`Shared headline context tokens: ${sharedHeadline}.`);
    }

    const sharedLocation = sharedTokenCount(mutual.location, target.location);
    if (sharedLocation > 0) {
      const bonus = Math.min(15, sharedLocation * 5);
      score += bonus;
      rationale.push(`Shared location context tokens: ${sharedLocation}.`);
    }

    if (!mutual.headline) {
      score -= 5;
      rationale.push("Limited headline context available.");
    }

    return {
      score,
      rationale,
      sourceProfileUrl,
      via: mutual,
      targetProfileUrl: target.profileUrl,
      targetName: target.name,
      path: [sourceProfileUrl, mutual.profileUrl, target.profileUrl] as [string, string, string]
    };
  });

  return scored.sort((a, b) => b.score - a.score || a.via.name.localeCompare(b.via.name));
}

// ---------------------------------------------------------------------------
// Mutual connection helpers
// ---------------------------------------------------------------------------

async function resolveMutualConnectionsSearchUrl(page: Page): Promise<string | null> {
  const url = await page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const preferred = links.find((link) => {
        const text = (link.textContent ?? "").toLowerCase();
        const href = link.getAttribute("href") ?? "";
        const absolute = new URL(href, "https://www.linkedin.com").toString();
        if (!absolute.includes("linkedin.com")) {
          return false;
        }
        const hintsMutual =
          text.includes("mutual") || absolute.includes("facetConnectionOf") || absolute.includes("connectionof");
        const pointsToPeopleSearch = absolute.includes("/search/results/people/");
        return hintsMutual && pointsToPeopleSearch;
      });

      if (!preferred) {
        return "";
      }

      return new URL(preferred.getAttribute("href") ?? "", "https://www.linkedin.com").toString();
    })
    .catch(() => "");

  return url || null;
}

function buildMutualConnectionsSearchUrl(profileEntityId: string): string {
  const url = new URL("https://www.linkedin.com/search/results/people/");
  url.searchParams.set("facetNetwork", '"F"');
  url.searchParams.set("facetConnectionOf", `"${profileEntityId}"`);
  url.searchParams.set("origin", "MEMBER_PROFILE_CANNED_SEARCH");
  return url.toString();
}

async function resolveProfileEntityId(page: Page): Promise<string | null> {
  const value = await page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));

      for (const link of links) {
        const href = link.getAttribute("href") ?? "";
        const absolute = new URL(href, "https://www.linkedin.com");
        const profileUrn = absolute.searchParams.get("profileUrn") ?? absolute.searchParams.get("miniProfileUrn");
        if (!profileUrn) {
          continue;
        }

        const decoded = decodeURIComponent(profileUrn);
        const match = decoded.match(/^urn:li:fsd_profile:([A-Za-z0-9_-]+)/i);
        if (match) {
          return match[1];
        }
      }

      return "";
    })
    .catch(() => "");

  return value || null;
}

async function scrapeVisibleMutualConnections(page: Page): Promise<MutualConnectionResult[]> {
  const raw = await page
    .evaluate(() => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>("section, div[role='region'], div"));
      const mutualSection = sections.find((section) => /mutual connections?/i.test(section.innerText));
      if (!mutualSection) {
        return [];
      }

      const links = Array.from(mutualSection.querySelectorAll<HTMLAnchorElement>("a[href*='/in/']"));
      return links.map((link) => {
        const wrapper = link.closest<HTMLElement>("li, article, div") ?? link;
        return {
          profileUrl: link.href,
          text: wrapper.innerText ?? link.innerText ?? ""
        };
      });
    })
    .catch(() => []);

  const mapped = raw
    .map((item) => {
      const parsed = parseSearchCardText(item.text);
      return {
        name: parsed.name,
        headline: parsed.headline,
        location: parsed.location,
        connectionDegree: inferDegree(item.text),
        profileUrl: toCanonicalProfileUrl(item.profileUrl)
      };
    })
    .filter((item) => item.name && item.profileUrl);

  const deduped = new Map<string, MutualConnectionResult>();
  for (const mutual of mapped) {
    deduped.set(mutual.profileUrl, mutual);
  }
  return Array.from(deduped.values());
}

// ---------------------------------------------------------------------------
// Exported high-level functions: Profile resolution
// ---------------------------------------------------------------------------

export async function resolveMyProfileUrl(page: Page): Promise<string> {
  logger.debug("Resolving own profile URL via /in/me/...");
  await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded" });

  try {
    await page.waitForURL(/\/in\/(?!me\/)[^/?#]+\/?/, { timeout: 3500 });
  } catch {
    logger.debug("URL did not redirect from /in/me/, trying fallbacks.");
  }

  if (!page.url().includes("/in/me/")) {
    const resolved = toCanonicalProfileUrl(page.url());
    logger.debug(`Resolved from redirect: ${resolved}`);
    return resolved;
  }

  logger.debug("Trying canonical link and DOM link fallbacks on /in/me/ page...");
  const fallbackFromMePage = await page
    .evaluate(() => {
      const canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href;
      if (canonical && canonical.includes("/in/") && !canonical.includes("/in/me/")) {
        return canonical;
      }

      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/in/']"));
      const ownProfileLink = links.find((link) => {
        const href = link.getAttribute("href") ?? "";
        const full = new URL(href, "https://www.linkedin.com").toString();
        const match = full.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (!match) {
          return false;
        }
        return match[1].toLowerCase() !== "me";
      });

      return ownProfileLink?.href ?? "";
    })
    .catch(() => "");

  if (fallbackFromMePage) {
    const resolved = toCanonicalProfileUrl(fallbackFromMePage);
    logger.debug(`Resolved from /in/me/ page DOM: ${resolved}`);
    return resolved;
  }

  logger.debug("Trying feed page fallback...");
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  await randomDelay(800, 1200);

  const fallbackFromFeed = await page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/in/']"));
      const ownProfileLink = links.find((link) => {
        const href = link.getAttribute("href") ?? "";
        const full = new URL(href, "https://www.linkedin.com").toString();
        const match = full.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (!match) {
          return false;
        }
        return match[1].toLowerCase() !== "me";
      });

      return ownProfileLink?.href ?? "";
    })
    .catch(() => "");

  if (!fallbackFromFeed) {
    throw new Error("Could not resolve your LinkedIn profile URL from session.");
  }

  const resolved = toCanonicalProfileUrl(fallbackFromFeed);
  logger.debug(`Resolved from feed page: ${resolved}`);
  return resolved;
}

// ---------------------------------------------------------------------------
// Exported: People search
// ---------------------------------------------------------------------------

export async function searchPeople(page: Page, filters: SearchPeopleFilters): Promise<SearchPersonResult[]> {
  const collectForNetworkFilters = async (network: Array<"1" | "2" | "3">): Promise<SearchPersonResult[]> => {
    const url = buildPeopleSearchUrl({ ...filters, network });
    const fetchLimit = filters.location ? Math.max(filters.limit * 3, 30) : Math.max(filters.limit + 10, 20);
    return collectPeopleResultsByPageNumber(page, url, fetchLimit);
  };

  let results: SearchPersonResult[];
  if (filters.network.length > 1) {
    const perNetworkResults = new Map<"1" | "2" | "3", SearchPersonResult[]>();
    for (const degree of filters.network) {
      const partial = await collectForNetworkFilters([degree]);
      perNetworkResults.set(degree, partial);
    }

    const interleaved = new Map<string, SearchPersonResult>();
    const maxPerNetworkLength = Math.max(
      ...filters.network.map((degree) => (perNetworkResults.get(degree) ?? []).length),
      0
    );

    for (let i = 0; i < maxPerNetworkLength; i += 1) {
      for (const degree of filters.network) {
        const item = perNetworkResults.get(degree)?.[i];
        if (item && !interleaved.has(item.profileUrl)) {
          interleaved.set(item.profileUrl, item);
        }
      }
    }

    results = Array.from(interleaved.values());
  } else {
    results = await collectForNetworkFilters(filters.network);
  }

  if (filters.location) {
    const normalizedLocation = filters.location.toLowerCase();
    results = results.filter((result) => result.location.toLowerCase().includes(normalizedLocation));
  }

  if (filters.network.length > 0) {
    const allowed = new Set(filters.network);
    results = results.filter((result) => {
      if (result.connectionDegree.startsWith("1")) {
        return allowed.has("1");
      }
      if (result.connectionDegree.startsWith("2")) {
        return allowed.has("2");
      }
      if (result.connectionDegree.startsWith("3")) {
        return allowed.has("3");
      }
      return false;
    });
  }

  return results.slice(0, filters.limit);
}

// ---------------------------------------------------------------------------
// Exported: Mutual connections
// ---------------------------------------------------------------------------

export async function getMutualConnections(
  page: Page,
  targetProfileUrl: string,
  limit: number
): Promise<MutualConnectionResult[]> {
  if (limit <= 0) {
    return [];
  }

  const canonicalTargetUrl = toCanonicalProfileUrl(targetProfileUrl);
  if (!canonicalTargetUrl) {
    throw new Error("Invalid target profile URL.");
  }
  assertLinkedInUrl(canonicalTargetUrl);
  logger.debug(`Navigating to target profile: ${canonicalTargetUrl}`);
  await page.goto(canonicalTargetUrl, { waitUntil: "domcontentloaded" });
  await randomDelay(1200, 2000);

  let mutualSearchUrl = await resolveMutualConnectionsSearchUrl(page);
  if (!mutualSearchUrl) {
    logger.debug("No mutual connection link found, trying entity ID resolution...");
    const profileEntityId = await resolveProfileEntityId(page);
    if (profileEntityId) {
      mutualSearchUrl = buildMutualConnectionsSearchUrl(profileEntityId);
      logger.debug(`Built mutual search URL from entity ID: ${profileEntityId}`);
    }
  }

  if (!mutualSearchUrl) {
    logger.debug("Falling back to scraping visible mutual connections from profile page.");
    await randomDelay(800, 1500);
    return (await scrapeVisibleMutualConnections(page)).slice(0, limit);
  }

  const people = await collectPeopleResultsByPageNumber(page, mutualSearchUrl, limit, 50);
  return people.map((person) => ({
    name: person.name,
    headline: person.headline,
    location: person.location,
    connectionDegree: person.connectionDegree,
    profileUrl: person.profileUrl
  }));
}

// ---------------------------------------------------------------------------
// Exported: Warm intro paths
// ---------------------------------------------------------------------------

export async function getWarmIntroPaths(
  page: Page,
  targetProfileUrl: string,
  limit: number
): Promise<WarmIntroPathResult[]> {
  if (limit <= 0) {
    return [];
  }

  const sourceProfileUrl = await resolveMyProfileUrl(page);
  const target = await getProfile(page, targetProfileUrl);
  const mutuals = await getMutualConnections(page, target.profileUrl, limit);

  return buildWarmIntroPathsFromMutuals({
    sourceProfileUrl,
    target: {
      profileUrl: target.profileUrl,
      name: target.name,
      headline: target.headline,
      location: target.location
    },
    mutuals
  }).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Exported: Profile
// ---------------------------------------------------------------------------

export async function getProfile(page: Page, profileUrl: string): Promise<ProfileResult> {
  const normalized = normalizeProfileUrl(profileUrl);
  if (!normalized) {
    throw new Error("Invalid profile URL.");
  }
  assertLinkedInUrl(normalized);

  logger.debug(`Navigating to profile: ${normalized}`);
  await page.goto(normalized, { waitUntil: "domcontentloaded" });
  await randomDelay(800, 1400);

  const profile = await page.evaluate(() => {
    const name = document.querySelector<HTMLElement>("h1")?.innerText ?? "";
    const headline = document.querySelector<HTMLElement>(".text-body-medium")?.innerText ?? "";
    const location =
      document.querySelector<HTMLElement>(".text-body-small.inline.t-black--light.break-words")?.innerText ?? "";

    let about = "";
    const aboutSection = document.querySelector("section#about");
    if (aboutSection) {
      const aboutText = aboutSection.querySelector<HTMLElement>(".inline-show-more-text")?.innerText;
      about = aboutText ?? "";
    }

    return {
      name: name.trim(),
      headline: headline.trim(),
      location: location.trim(),
      about: about.trim()
    };
  });

  if (!profile.name) {
    logger.warn("Could not extract profile name. LinkedIn's page structure may have changed.");
  }

  return {
    profileUrl: normalizeProfileUrl(page.url()),
    ...profile
  };
}

// ---------------------------------------------------------------------------
// Exported: Detailed profile (experience, education, skills)
// ---------------------------------------------------------------------------

export async function getDetailedProfile(page: Page, profileUrl: string): Promise<DetailedProfileResult> {
  const basic = await getProfile(page, profileUrl);

  // Scroll down to load lazy sections
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(400, 800);
  }

  const experience = await scrapeExperience(page);
  const education = await scrapeEducation(page);
  const skills = await scrapeSkills(page);

  return {
    ...basic,
    experience,
    education,
    skills
  };
}

async function scrapeExperience(page: Page): Promise<ExperienceEntry[]> {
  return page
    .evaluate(() => {
      const results: Array<{ title: string; company: string; dateRange: string; location: string; description: string }> = [];

      // Try section#experience first
      let section = document.querySelector<HTMLElement>("section#experience");
      if (!section) {
        // Fallback: find section with "Experience" heading
        const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
        section =
          sections.find((s) => {
            const heading = s.querySelector("h2");
            return heading && /experience/i.test(heading.innerText);
          }) ?? null;
      }

      if (!section) {
        return results;
      }

      const items = Array.from(section.querySelectorAll<HTMLElement>("li.artdeco-list__item, li.pvs-list__paged-list-item"));

      for (const item of items) {
        const spans = Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true']"));
        const textParts = spans.map((s) => s.innerText.trim()).filter(Boolean);

        if (textParts.length === 0) {
          continue;
        }

        const title = textParts[0] ?? "";
        const company = textParts[1] ?? "";
        const dateRange = textParts.find((t) => /\d{4}|present/i.test(t) && t !== title) ?? "";
        const locationCandidates = textParts.filter(
          (t) => t !== title && t !== company && t !== dateRange && !/^\d+ (yr|mo|year|month)/i.test(t)
        );
        const loc = locationCandidates.find((c) => /,|\b(area|city|state|country)\b/i.test(c)) ?? locationCandidates[0] ?? "";

        const descEl = item.querySelector<HTMLElement>(".inline-show-more-text, .pvs-list__outer-container .visually-hidden");
        const description = descEl?.innerText?.trim() ?? "";

        results.push({ title, company, dateRange, location: loc, description });
      }

      return results;
    })
    .catch((err) => {
      logger.debug(`Experience scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
}

async function scrapeEducation(page: Page): Promise<EducationEntry[]> {
  return page
    .evaluate(() => {
      const results: Array<{ school: string; degree: string; fieldOfStudy: string; dateRange: string }> = [];

      let section = document.querySelector<HTMLElement>("section#education");
      if (!section) {
        const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
        section =
          sections.find((s) => {
            const heading = s.querySelector("h2");
            return heading && /education/i.test(heading.innerText);
          }) ?? null;
      }

      if (!section) {
        return results;
      }

      const items = Array.from(section.querySelectorAll<HTMLElement>("li.artdeco-list__item, li.pvs-list__paged-list-item"));

      for (const item of items) {
        const spans = Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true']"));
        const textParts = spans.map((s) => s.innerText.trim()).filter(Boolean);

        if (textParts.length === 0) {
          continue;
        }

        const school = textParts[0] ?? "";
        const degreeLine = textParts[1] ?? "";
        const parts = degreeLine.split(",").map((p) => p.trim());
        const degree = parts[0] ?? "";
        const fieldOfStudy = parts.slice(1).join(", ");
        const dateRange = textParts.find((t) => /\d{4}/.test(t) && t !== school && t !== degreeLine) ?? "";

        results.push({ school, degree, fieldOfStudy, dateRange });
      }

      return results;
    })
    .catch((err) => {
      logger.debug(`Education scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
}

async function scrapeSkills(page: Page): Promise<string[]> {
  return page
    .evaluate(() => {
      let section = document.querySelector<HTMLElement>("section#skills");
      if (!section) {
        const sections = Array.from(document.querySelectorAll<HTMLElement>("section"));
        section =
          sections.find((s) => {
            const heading = s.querySelector("h2");
            return heading && /skills/i.test(heading.innerText);
          }) ?? null;
      }

      if (!section) {
        return [];
      }

      const items = Array.from(section.querySelectorAll<HTMLElement>("li.artdeco-list__item, li.pvs-list__paged-list-item"));

      return items
        .map((item) => {
          const span = item.querySelector<HTMLElement>("span[aria-hidden='true']");
          return span?.innerText?.trim() ?? "";
        })
        .filter(Boolean);
    })
    .catch((err) => {
      logger.debug(`Skills scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });
}

// ---------------------------------------------------------------------------
// Exported: Posts
// ---------------------------------------------------------------------------

function normalizeProfileBase(url: string): string {
  const normalized = normalizeProfileUrl(url);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export async function listPosts(
  page: Page,
  profileUrl: string,
  limit: number,
  withEngagement: boolean = false
): Promise<PostResult[]> {
  if (limit <= 0) {
    return [];
  }

  const base = normalizeProfileBase(profileUrl);
  const activityUrl = `${base}recent-activity/all/`;

  logger.debug(`Navigating to activity page: ${activityUrl}`);
  await page.goto(activityUrl, { waitUntil: "domcontentloaded" });
  await randomDelay(1000, 1800);

  const seen = new Map<string, PostResult>();
  let stableRounds = 0;
  let previousCount = 0;
  const maxRounds = 30;

  for (let round = 0; round < maxRounds; round += 1) {
    const posts = await page
      .evaluate((includeEngagement: boolean) => {
        const cards = Array.from(
          document.querySelectorAll("div.feed-shared-update-v2, div.occludable-update")
        );

        return cards.map((card) => {
          const postLink = card.querySelector<HTMLAnchorElement>(
            "a[href*='/feed/update/'], a[href*='/posts/']"
          );
          const text = card.querySelector<HTMLElement>("span.break-words")?.innerText ?? "";
          const postedAt =
            card.querySelector<HTMLElement>(".update-components-actor__sub-description")?.innerText ?? "";

          let reactionCount = "";
          let commentCount = "";

          if (includeEngagement) {
            const socialCounts = card.querySelector<HTMLElement>(".social-details-social-counts");
            if (socialCounts) {
              const reactionEl = socialCounts.querySelector<HTMLElement>(
                "button[aria-label*='reaction'], span.social-details-social-counts__reactions-count"
              );
              reactionCount = reactionEl?.innerText?.trim() ?? "";

              const commentEl = socialCounts.querySelector<HTMLElement>(
                "button[aria-label*='comment'], li.social-details-social-counts__comments"
              );
              commentCount = commentEl?.innerText?.trim().replace(/\s*comments?$/i, "") ?? "";
            }
          }

          return {
            text: text.trim(),
            postUrl: postLink?.href ?? "",
            postedAt: postedAt.trim(),
            reactionCount,
            commentCount
          };
        });
      }, withEngagement)
      .catch(() => []);

    for (const post of posts) {
      if (!post.postUrl && !post.text) {
        continue;
      }

      const normalizedUrl = post.postUrl ? normalizeProfileUrl(post.postUrl) : "";
      const key = normalizedUrl || `text:${post.text.slice(0, 120)}`;
      if (!seen.has(key)) {
        seen.set(key, {
          text: post.text,
          postUrl: normalizedUrl,
          postedAt: post.postedAt,
          reactionCount: post.reactionCount,
          commentCount: post.commentCount
        });
      }
    }

    if (seen.size >= limit) {
      break;
    }

    if (seen.size === previousCount) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousCount = seen.size;
    }

    if (stableRounds >= 4) {
      logger.debug("Post collection stabilized, stopping scroll.");
      break;
    }

    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(700, 1300);
  }

  logger.debug(`Collected ${seen.size} posts.`);
  return Array.from(seen.values()).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Exported: Connection list
// ---------------------------------------------------------------------------

export async function listConnections(page: Page, limit: number): Promise<SearchPersonResult[]> {
  if (limit <= 0) {
    return [];
  }

  logger.debug("Navigating to connections page...");
  await page.goto("https://www.linkedin.com/mynetwork/invite-connect/connections/", {
    waitUntil: "domcontentloaded"
  });
  await randomDelay(1000, 1800);

  const seen = new Map<string, SearchPersonResult>();
  let stableRounds = 0;
  let previousCount = 0;
  const maxRounds = 60;

  for (let round = 0; round < maxRounds; round += 1) {
    const connections = await page
      .evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "li.mn-connection-card, li.scaffold-finite-scroll__content > li, div.mn-connection-card"
          )
        );

        return cards.map((card) => {
          const anchor = card.querySelector<HTMLAnchorElement>("a[href*='/in/']");
          const nameEl = card.querySelector<HTMLElement>("span.mn-connection-card__name, span[aria-hidden='true']");
          const occupationEl = card.querySelector<HTMLElement>(
            "span.mn-connection-card__occupation, p.mn-connection-card__occupation"
          );

          return {
            name: nameEl?.innerText?.trim() ?? "",
            headline: occupationEl?.innerText?.trim() ?? "",
            profileUrl: anchor?.href ?? ""
          };
        });
      })
      .catch(() => []);

    for (const conn of connections) {
      if (!conn.profileUrl || !conn.name) {
        continue;
      }
      const canonical = toCanonicalProfileUrl(conn.profileUrl);
      if (canonical && !seen.has(canonical)) {
        seen.set(canonical, {
          name: conn.name,
          headline: conn.headline,
          location: "",
          connectionDegree: "1st",
          profileUrl: canonical
        });
      }
    }

    logger.debug(`Round ${round + 1}: ${seen.size} connections collected`);

    if (seen.size >= limit) {
      break;
    }

    if (seen.size === previousCount) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousCount = seen.size;
    }

    if (stableRounds >= 5) {
      logger.debug("Connection collection stabilized.");
      break;
    }

    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(600, 1200);
  }

  return Array.from(seen.values()).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Exported: Company profile
// ---------------------------------------------------------------------------

export async function getCompanyProfile(page: Page, companyUrl: string): Promise<CompanyResult> {
  const canonical = toCanonicalCompanyUrl(companyUrl);
  if (!canonical) {
    throw new Error("Invalid company URL. Expected https://www.linkedin.com/company/<slug>/");
  }
  assertLinkedInUrl(canonical);

  const aboutUrl = `${canonical}about/`;
  logger.debug(`Navigating to company about page: ${aboutUrl}`);
  await page.goto(aboutUrl, { waitUntil: "domcontentloaded" });
  await randomDelay(800, 1500);

  // Scroll to load content
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(300, 600);
  }

  const result = await page
    .evaluate(() => {
      const name = document.querySelector<HTMLElement>("h1")?.innerText?.trim() ?? "";

      // Collect key-value pairs from definition lists
      const fields: Record<string, string> = {};
      const definitionLists = Array.from(document.querySelectorAll<HTMLElement>("dl"));
      for (const dl of definitionLists) {
        const dts = Array.from(dl.querySelectorAll<HTMLElement>("dt"));
        const dds = Array.from(dl.querySelectorAll<HTMLElement>("dd"));
        for (let i = 0; i < dts.length && i < dds.length; i++) {
          const rawKey = dts[i].innerText.trim().toLowerCase().replace(/\s+/g, " ");
          // Take only the first line of the value to avoid picking up extra content
          const rawValue = dds[i].innerText.trim().split("\n")[0].trim();
          fields[rawKey] = rawValue;
        }
      }

      // Also try to find fields in a grid/list format (some company pages use divs)
      const allText = document.body?.innerText ?? "";
      const extractField = (label: string): string => {
        const existing = fields[label.toLowerCase()];
        if (existing) return existing;
        const regex = new RegExp(`${label}\\s*\\n\\s*(.+)`, "i");
        const match = allText.match(regex);
        return match?.[1]?.trim() ?? "";
      };

      const aboutSection =
        document.querySelector<HTMLElement>("section.org-about-module__margin-bottom p") ??
        document.querySelector<HTMLElement>("p.break-words");
      const about = aboutSection?.innerText?.trim() ?? "";

      return {
        name,
        industry: extractField("Industry") || extractField("Industries"),
        size: extractField("Company size") || extractField("Size"),
        headquarters: extractField("Headquarters"),
        founded: extractField("Founded"),
        about,
        specialties: extractField("Specialties"),
        website: extractField("Website")
      };
    })
    .catch((err) => {
      logger.debug(`Company scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      return { name: "", industry: "", size: "", headquarters: "", founded: "", about: "", specialties: "", website: "" };
    });

  return {
    companyUrl: canonical,
    ...result
  };
}

// ---------------------------------------------------------------------------
// Exported: Job search
// ---------------------------------------------------------------------------

export async function searchJobs(page: Page, filters: SearchJobsFilters): Promise<JobResult[]> {
  if (filters.limit <= 0) {
    return [];
  }

  const url = new URL("https://www.linkedin.com/jobs/search/");
  url.searchParams.set("keywords", filters.keywords.trim());
  if (filters.location) {
    url.searchParams.set("location", filters.location.trim());
  }
  if (filters.remote) {
    url.searchParams.set("f_WT", "2");
  }
  url.searchParams.set("origin", "JOBS_HOME_SEARCH_BUTTON");

  logger.debug(`Navigating to job search: ${url.toString()}`);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await randomDelay(1000, 2000);

  const seen = new Map<string, JobResult>();
  let stableRounds = 0;
  let previousCount = 0;
  const maxRounds = 15;

  for (let round = 0; round < maxRounds; round += 1) {
    const jobs = await page
      .evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "li.jobs-search-results__list-item, div.job-card-container, li.scaffold-layout__list-item"
          )
        );

        return cards.map((card) => {
          const titleEl =
            card.querySelector<HTMLElement>("a.job-card-list__title, a.job-card-container__link") ??
            card.querySelector<HTMLAnchorElement>("a[href*='/jobs/view/']");
          const companyEl = card.querySelector<HTMLElement>(
            ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle"
          );
          const locationEl = card.querySelector<HTMLElement>(
            ".job-card-container__metadata-item, .artdeco-entity-lockup__caption"
          );
          const postedAtEl = card.querySelector<HTMLElement>("time, .job-card-container__footer-item");
          const workplaceEl = card.querySelector<HTMLElement>(
            ".job-card-container__metadata-item--workplace-type"
          );

          const href =
            titleEl?.getAttribute("href") ??
            card.querySelector<HTMLAnchorElement>("a[href*='/jobs/view/']")?.href ??
            "";

          return {
            title: titleEl?.innerText?.trim() ?? "",
            company: companyEl?.innerText?.trim() ?? "",
            location: locationEl?.innerText?.trim() ?? "",
            postedAt: postedAtEl?.innerText?.trim() ?? "",
            jobUrl: href,
            workplace: workplaceEl?.innerText?.trim() ?? ""
          };
        });
      })
      .catch(() => []);

    for (const job of jobs) {
      if (!job.title) {
        continue;
      }
      // LinkedIn often duplicates title text for screen readers - deduplicate
      let title = job.title;
      const titleLines = title.split("\n").map((l) => l.trim()).filter(Boolean);
      if (titleLines.length >= 2 && titleLines[0] === titleLines[1]) {
        title = titleLines[0];
      } else if (titleLines.length >= 2) {
        title = titleLines[0];
      }

      const normalizedUrl = job.jobUrl ? normalizeProfileUrl(job.jobUrl) : "";
      const key = normalizedUrl || `${title}::${job.company}`;
      if (!seen.has(key)) {
        seen.set(key, {
          title,
          company: job.company,
          location: job.location,
          postedAt: job.postedAt,
          jobUrl: normalizedUrl,
          workplace: job.workplace
        });
      }
    }

    logger.debug(`Job search round ${round + 1}: ${seen.size} jobs collected`);

    if (seen.size >= filters.limit) {
      break;
    }

    if (seen.size === previousCount) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      previousCount = seen.size;
    }

    if (stableRounds >= 3) {
      break;
    }

    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(700, 1300);
  }

  return Array.from(seen.values()).slice(0, filters.limit);
}

// ---------------------------------------------------------------------------
// Exported: Messages
// ---------------------------------------------------------------------------

export async function listMessages(page: Page, limit: number): Promise<MessageThread[]> {
  if (limit <= 0) {
    return [];
  }

  logger.debug("Navigating to messaging...");
  await page.goto("https://www.linkedin.com/messaging/", { waitUntil: "domcontentloaded" });
  await randomDelay(1500, 2500);

  const threads = await page
    .evaluate(() => {
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          "li.msg-conversation-listitem, li.msg-conversations-container__convo-item"
        )
      );

      return items.map((item) => {
        const nameEl = item.querySelector<HTMLElement>(
          ".msg-conversation-listitem__participant-names, h3.msg-conversation-card__title"
        );
        const lastMsgEl = item.querySelector<HTMLElement>(
          ".msg-conversation-listitem__message-snippet, p.msg-conversation-card__message-snippet"
        );
        const timeEl = item.querySelector<HTMLElement>(
          ".msg-conversation-listitem__time-stamp, time"
        );
        const linkEl = item.querySelector<HTMLAnchorElement>("a[href*='/messaging/']");

        return {
          participantName: nameEl?.innerText?.trim() ?? "",
          lastMessage: lastMsgEl?.innerText?.trim() ?? "",
          timestamp: timeEl?.innerText?.trim() ?? "",
          threadUrl: linkEl?.href ?? ""
        };
      });
    })
    .catch((err) => {
      logger.debug(`Message scraping failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    });

  return threads.filter((t) => t.participantName).slice(0, limit);
}

export async function sendMessage(page: Page, profileUrl: string, messageText: string): Promise<void> {
  const canonical = toCanonicalProfileUrl(profileUrl);
  if (!canonical) {
    throw new Error("Invalid profile URL.");
  }
  assertLinkedInUrl(canonical);

  logger.debug(`Navigating to profile for messaging: ${canonical}`);
  await page.goto(canonical, { waitUntil: "domcontentloaded" });
  await randomDelay(1000, 1800);

  // Click the Message button
  const messageButton = await page
    .locator("button:has-text('Message'), a:has-text('Message')")
    .first()
    .elementHandle();

  if (!messageButton) {
    throw new Error("Could not find Message button on profile. The person may not allow messages.");
  }

  await messageButton.click();
  await randomDelay(1000, 1800);

  // Type the message
  const messageBox = await page
    .locator("div.msg-form__contenteditable, div[role='textbox'][contenteditable='true']")
    .first()
    .elementHandle();

  if (!messageBox) {
    throw new Error("Could not find message input box.");
  }

  await messageBox.click();
  await page.keyboard.type(messageText, { delay: 30 + Math.random() * 50 });
  await randomDelay(500, 1000);

  // Click Send
  const sendButton = await page
    .locator("button.msg-form__send-button, button:has-text('Send')")
    .first()
    .elementHandle();

  if (!sendButton) {
    throw new Error("Could not find Send button.");
  }

  await sendButton.click();
  await randomDelay(800, 1500);

  // Check for error toast
  const errorToast = await page.$('div.artdeco-toast-item--error, div[role="alert"]');
  if (errorToast) {
    const errorText = await errorToast.innerText().catch(() => "Unknown error");
    throw new Error(`LinkedIn reported an error: ${errorText}`);
  }

  logger.debug("Message sent.");
}

// ---------------------------------------------------------------------------
// Exported: Connection requests
// ---------------------------------------------------------------------------

export async function sendConnectionRequest(page: Page, profileUrl: string, note?: string): Promise<void> {
  const canonical = toCanonicalProfileUrl(profileUrl);
  if (!canonical) {
    throw new Error("Invalid profile URL.");
  }
  assertLinkedInUrl(canonical);

  logger.debug(`Navigating to profile for connection request: ${canonical}`);
  await page.goto(canonical, { waitUntil: "domcontentloaded" });
  await randomDelay(1000, 1800);

  // Look for Connect button
  const connectButton = await page
    .locator("button:has-text('Connect')")
    .first()
    .elementHandle();

  if (!connectButton) {
    // Might be under "More" dropdown
    const moreButton = await page.locator("button:has-text('More')").first().elementHandle();
    if (moreButton) {
      await moreButton.click();
      await randomDelay(500, 1000);
    }

    const connectInMenu = await page
      .locator("div[role='menuitem']:has-text('Connect'), li:has-text('Connect') button")
      .first()
      .elementHandle();

    if (!connectInMenu) {
      throw new Error("Could not find Connect button. You may already be connected or pending.");
    }
    await connectInMenu.click();
  } else {
    await connectButton.click();
  }

  await randomDelay(800, 1500);

  if (note) {
    // Click "Add a note" if available
    const addNoteButton = await page
      .locator("button:has-text('Add a note')")
      .first()
      .elementHandle();

    if (!addNoteButton) {
      logger.warn("Could not find 'Add a note' button. Sending connection request without note.");
    } else {
      await addNoteButton.click();
      await randomDelay(500, 1000);

      const noteBox = await page
        .locator("textarea[name='message'], textarea#custom-message")
        .first()
        .elementHandle();

      if (!noteBox) {
        logger.warn("Could not find note text area. Sending connection request without note.");
      } else {
        await noteBox.click();
        await page.keyboard.type(note, { delay: 30 + Math.random() * 50 });
        await randomDelay(400, 800);
      }
    }
  }

  // Click Send
  const sendButton = await page
    .locator("button:has-text('Send'), button[aria-label='Send now']")
    .first()
    .elementHandle();

  if (sendButton) {
    await sendButton.click();
    await randomDelay(800, 1500);

    // Check for error toast
    const errorToast = await page.$('div.artdeco-toast-item--error, div[role="alert"]');
    if (errorToast) {
      const errorText = await errorToast.innerText().catch(() => "Unknown error");
      throw new Error(`LinkedIn reported an error: ${errorText}`);
    }

    logger.debug("Connection request sent.");
  } else {
    throw new Error("Could not find Send button for connection request.");
  }
}

// ---------------------------------------------------------------------------
// Exported: Screenshot
// ---------------------------------------------------------------------------

export async function screenshotProfile(page: Page, profileUrl: string, outputPath: string): Promise<string> {
  const normalized = normalizeProfileUrl(profileUrl);
  if (!normalized) {
    throw new Error("Invalid profile URL.");
  }
  assertLinkedInUrl(normalized);

  logger.debug(`Navigating to profile for screenshot: ${normalized}`);
  await page.goto(normalized, { waitUntil: "domcontentloaded" });
  await randomDelay(1000, 1800);

  // Scroll to load content
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((pixels) => window.scrollBy(0, pixels), randomScrollPixels());
    await randomDelay(300, 500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await randomDelay(300, 500);

  await page.screenshot({ path: outputPath, fullPage: true });
  logger.debug(`Screenshot saved to ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// Exported: URL builders (used by url command)
// ---------------------------------------------------------------------------

export function buildProfileUrl(vanityName: string): string {
  const input = vanityName.trim();
  if (!input) {
    throw new Error("Profile id cannot be empty.");
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const canonical = toCanonicalProfileUrl(input);
    if (!/linkedin\.com\/in\/[^/]+\/?$/i.test(canonical)) {
      throw new Error("Profile URL must include /in/<vanity-name>.");
    }
    return canonical;
  }

  const clean = input.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) {
    throw new Error("Profile id cannot be empty.");
  }
  return `https://www.linkedin.com/in/${clean}/`;
}

export function buildPostUrl(activityId: string): string {
  const input = activityId.trim();
  if (!input) {
    throw new Error("Activity id cannot be empty.");
  }

  let id = input;

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const url = new URL(input);
    // Handle /feed/update/urn:li:activity:123/
    const matchActivity = url.pathname.match(/activity[:\-](\d+)/i);
    if (matchActivity) {
      id = matchActivity[1];
    } else {
      // Handle /posts/user-name-activity-123-xyz/
      const matchPosts = url.pathname.match(/activity[- ](\d+)/i) ?? url.pathname.match(/(\d{10,})/);
      if (matchPosts) {
        id = matchPosts[1];
      }
    }
  } else {
    const matchFromUrn = input.match(/urn:li:activity:(\d+)/i);
    if (matchFromUrn) {
      id = matchFromUrn[1];
    }
  }

  if (!/^\d+$/.test(id)) {
    throw new Error("Activity id must be numeric or include urn:li:activity:<numeric-id>.");
  }

  return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
}

export function buildCompanyUrl(slug: string): string {
  const input = slug.trim();
  if (!input) {
    throw new Error("Company identifier cannot be empty.");
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const canonical = toCanonicalCompanyUrl(input);
    if (!canonical || !canonical.includes("/company/")) {
      throw new Error("Company URL must include /company/<slug>.");
    }
    return canonical;
  }

  const clean = input.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!clean) {
    throw new Error("Company identifier cannot be empty.");
  }
  return `https://www.linkedin.com/company/${clean}/`;
}
