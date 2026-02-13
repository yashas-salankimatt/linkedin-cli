export type OutputFormat = "text" | "json" | "csv" | "tsv";

function escapeField(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function flattenForCSV(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.map((item) => {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value)) {
        flat[key] = JSON.stringify(value);
      } else if (typeof value === "object" && value !== null) {
        for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
          flat[`${key}.${subKey}`] = subValue;
        }
      } else {
        flat[key] = value;
      }
    }
    return flat;
  });
}

function toDelimited(data: Record<string, unknown>[], delimiter: string): string {
  if (data.length === 0) {
    return "";
  }

  const flattened = flattenForCSV(data);
  const headerSet = new Set<string>();
  for (const row of flattened) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  const lines = [
    headers.map((h) => escapeField(h, delimiter)).join(delimiter),
    ...flattened.map((row) => headers.map((h) => escapeField(row[h], delimiter)).join(delimiter))
  ];

  return lines.join("\n");
}

export function applyTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, keyPath: string) => {
    const keys = keyPath.split(".");
    let current: unknown = data;
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== "object") {
        return "";
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (current === null || current === undefined) {
      return "";
    }
    if (typeof current === "object") {
      return JSON.stringify(current);
    }
    return String(current);
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatObjectText(obj: Record<string, unknown>, indent: string = ""): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      lines.push(`${indent}${key}: (${value.length} items)`);
      for (const [i, item] of value.entries()) {
        if (typeof item === "object" && item !== null) {
          lines.push(`${indent}  [${i + 1}]`);
          lines.push(...formatObjectText(item as Record<string, unknown>, `${indent}    `));
        } else {
          lines.push(`${indent}  - ${formatValue(item)}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${indent}${key}:`);
      lines.push(...formatObjectText(value as Record<string, unknown>, `${indent}  `));
    } else {
      lines.push(`${indent}${key}: ${formatValue(value)}`);
    }
  }
  return lines;
}

function formatText(payload: unknown): string {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return "No results.";
    }

    return payload
      .map((item, index) => {
        const lines = [`Result ${index + 1}`];
        lines.push(...formatObjectText(item as Record<string, unknown>, "  "));
        return lines.join("\n");
      })
      .join("\n\n");
  }

  return formatObjectText(payload as Record<string, unknown>).join("\n");
}

export function formatOutput(payload: unknown, format: OutputFormat, template?: string): string {
  if (format === "json") {
    return JSON.stringify(payload, null, 2);
  }

  if (format === "csv" || format === "tsv") {
    const delimiter = format === "csv" ? "," : "\t";
    const arr = Array.isArray(payload) ? payload : [payload];
    if (arr.length === 0) {
      return "";
    }
    return toDelimited(arr as Record<string, unknown>[], delimiter);
  }

  if (template) {
    const arr = Array.isArray(payload) ? payload : [payload];
    return arr.map((item) => applyTemplate(template, item as Record<string, unknown>)).join("\n");
  }

  return formatText(payload);
}
