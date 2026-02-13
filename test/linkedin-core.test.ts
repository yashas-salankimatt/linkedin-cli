import { describe, expect, it } from "vitest";
import {
  buildCompanyUrl,
  buildPeopleSearchUrl,
  buildPostUrl,
  buildProfileUrl,
  buildWarmIntroPathsFromMutuals
} from "../src/core/linkedin.js";
import { formatOutput, applyTemplate } from "../src/utils/format.js";

describe("LinkedIn URL helpers", () => {
  it("builds profile URLs", () => {
    expect(buildProfileUrl("/jane-doe/")).toBe("https://www.linkedin.com/in/jane-doe/");
    expect(buildProfileUrl("https://www.linkedin.com/in/jane-doe/?trk=test")).toBe(
      "https://www.linkedin.com/in/jane-doe/"
    );
  });

  it("builds post URLs", () => {
    expect(buildPostUrl("123456789")).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:123456789/"
    );
    expect(buildPostUrl("urn:li:activity:123456789")).toBe(
      "https://www.linkedin.com/feed/update/urn:li:activity:123456789/"
    );
    expect(
      buildPostUrl(
        "https://www.linkedin.com/feed/update/urn:li:activity:123456789/?actorCompanyId=1"
      )
    ).toBe("https://www.linkedin.com/feed/update/urn:li:activity:123456789/");
  });

  it("builds post URLs from /posts/ style links", () => {
    expect(
      buildPostUrl("https://www.linkedin.com/posts/john-doe-activity-7291234567890123456-abcd")
    ).toBe("https://www.linkedin.com/feed/update/urn:li:activity:7291234567890123456/");
  });

  it("builds company URLs", () => {
    expect(buildCompanyUrl("openai")).toBe("https://www.linkedin.com/company/openai/");
    expect(buildCompanyUrl("https://www.linkedin.com/company/openai/about/")).toBe(
      "https://www.linkedin.com/company/openai/"
    );
  });

  it("rejects empty identifiers", () => {
    expect(() => buildProfileUrl("   ")).toThrowError("Profile id cannot be empty.");
    expect(() => buildPostUrl("   ")).toThrowError("Activity id cannot be empty.");
    expect(() => buildCompanyUrl("   ")).toThrowError("Company identifier cannot be empty.");
  });

  it("rejects malformed profile/post URL inputs", () => {
    expect(() => buildProfileUrl("https://www.linkedin.com/company/openai/")).toThrowError(
      "Profile URL must include /in/<vanity-name>."
    );
    expect(() => buildPostUrl("https://www.linkedin.com/feed/")).toThrowError(
      "Activity id must be numeric or include urn:li:activity:<numeric-id>."
    );
    expect(() => buildPostUrl("urn:li:activity:not-a-number")).toThrowError(
      "Activity id must be numeric or include urn:li:activity:<numeric-id>."
    );
  });

  it("builds people search URLs with network filters", () => {
    const url = buildPeopleSearchUrl({
      keywords: "software engineer",
      network: ["1", "2"],
      location: "San Francisco",
      limit: 10
    });

    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/search/results/people/");
    expect(parsed.searchParams.get("keywords")).toBe("software engineer San Francisco");
    expect(parsed.searchParams.get("network")).toBe('["F","S"]');
  });

  it("ranks warm intro paths using shared context and degree", () => {
    const paths = buildWarmIntroPathsFromMutuals({
      sourceProfileUrl: "https://www.linkedin.com/in/me/",
      target: {
        profileUrl: "https://www.linkedin.com/in/target/",
        name: "Target Person",
        headline: "Partner at Alpha Ventures",
        location: "San Francisco Bay Area"
      },
      mutuals: [
        {
          name: "Mutual Low",
          headline: "Designer",
          location: "Austin, Texas",
          connectionDegree: "2nd",
          profileUrl: "https://www.linkedin.com/in/mutual-low/"
        },
        {
          name: "Mutual High",
          headline: "Partner at Alpha Ventures",
          location: "San Francisco, California, United States",
          connectionDegree: "1st",
          profileUrl: "https://www.linkedin.com/in/mutual-high/"
        }
      ]
    });

    expect(paths[0]?.via.name).toBe("Mutual High");
    expect(paths[0]?.path).toEqual([
      "https://www.linkedin.com/in/me/",
      "https://www.linkedin.com/in/mutual-high/",
      "https://www.linkedin.com/in/target/"
    ]);
    expect(paths[0]?.score).toBeGreaterThan(paths[1]?.score ?? 0);
  });
});

describe("Output formatting", () => {
  const sampleData = [
    { name: "Alice", headline: "Engineer", location: "SF" },
    { name: "Bob", headline: "Designer", location: "NYC" }
  ];

  it("formats as JSON", () => {
    const output = formatOutput(sampleData, "json");
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("Alice");
  });

  it("formats as CSV", () => {
    const output = formatOutput(sampleData, "csv");
    const lines = output.split("\n");
    expect(lines[0]).toBe("name,headline,location");
    expect(lines[1]).toBe("Alice,Engineer,SF");
    expect(lines[2]).toBe("Bob,Designer,NYC");
  });

  it("formats as TSV", () => {
    const output = formatOutput(sampleData, "tsv");
    const lines = output.split("\n");
    expect(lines[0]).toBe("name\theadline\tlocation");
    expect(lines[1]).toBe("Alice\tEngineer\tSF");
  });

  it("formats as text", () => {
    const output = formatOutput(sampleData, "text");
    expect(output).toContain("Result 1");
    expect(output).toContain("name: Alice");
    expect(output).toContain("Result 2");
    expect(output).toContain("name: Bob");
  });

  it("handles empty arrays", () => {
    expect(formatOutput([], "text")).toBe("No results.");
    expect(formatOutput([], "csv")).toBe("");
  });

  it("formats nested objects in text mode", () => {
    const payload = {
      count: 1,
      items: [{ name: "Alice" }]
    };
    const output = formatOutput(payload, "text");
    expect(output).toContain("count: 1");
    expect(output).toContain("items: (1 items)");
  });

  it("escapes CSV fields with commas and quotes", () => {
    const data = [{ name: 'O"Brien', headline: "VP, Engineering" }];
    const output = formatOutput(data, "csv");
    expect(output).toContain('"O""Brien"');
    expect(output).toContain('"VP, Engineering"');
  });
});

describe("Template formatting", () => {
  it("applies simple templates", () => {
    const result = applyTemplate("{{name}} - {{headline}}", {
      name: "Alice",
      headline: "Engineer"
    });
    expect(result).toBe("Alice - Engineer");
  });

  it("handles missing keys gracefully", () => {
    const result = applyTemplate("{{name}} ({{missing}})", { name: "Alice" });
    expect(result).toBe("Alice ()");
  });

  it("supports nested key paths", () => {
    const result = applyTemplate("{{via.name}}", {
      via: { name: "Bob" }
    });
    expect(result).toBe("Bob");
  });
});
