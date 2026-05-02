/**
 * Performance Testing Utility
 *
 * Usage: Import this in your component for testing:
 * import { generateTestData, perfTest } from './src/utils/performanceTest';
 *
 * Then use: await generateTestData(100); // Creates 100 test entries
 */

import { v4 as uuidv4 } from "uuid";
import { PasswordEntry } from "../types";

export interface PerfTestConfig {
  entryCount: number;
  includeCategory: boolean;
  includeNotes: boolean;
}

/**
 * Generate test password entries for performance testing
 */
export const generateTestData = (
  count: number = 100,
  config: Partial<PerfTestConfig> = {},
): PasswordEntry[] => {
  const {
    entryCount = count,
    includeCategory = true,
    includeNotes = true,
  } = config;

  const categories = [
    "Social",
    "Banking",
    "Email",
    "Work",
    "Shopping",
    "Gaming",
  ];
  const domains = [
    "gmail",
    "facebook",
    "twitter",
    "linkedin",
    "slack",
    "github",
    "amazon",
    "netflix",
    "bank",
  ];
  const usernames = [
    "john.doe",
    "jane.smith",
    "alex.dev",
    "user123",
    "admin",
    "support",
  ];

  const entries: PasswordEntry[] = [];

  for (let i = 1; i <= entryCount; i++) {
    const domain = domains[i % domains.length];
    const username = usernames[i % usernames.length];
    const capitalizedDomain = domain.charAt(0).toUpperCase() + domain.slice(1);

    entries.push({
      id: uuidv4(),
      title: `${capitalizedDomain} #${i}`,
      username: `${username}${i}@${domain}.com`,
      password: `TestPass${i}!${Math.random().toString(36).slice(2, 8)}`,
      notes: includeNotes
        ? `Auto-generated test entry #${i} for performance testing.`
        : "",
      category: includeCategory
        ? (categories[i % categories.length] as any)
        : ("Other" as any),
      isFavorite: i % 10 === 0, // Make every 10th entry a favorite
      createdAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    });
  }

  if (__DEV__) {
    console.log(`[PerfTest] Generated ${entryCount} test entries`, {
      sample: entries[0],
    });
  }

  return entries;
};

/**
 * Performance timer utility
 */
export const perfTest = {
  start: (label: string) => {
    if (__DEV__) console.time(`[PerfTest] ${label}`);
  },

  end: (label: string) => {
    if (__DEV__) console.timeEnd(`[PerfTest] ${label}`);
  },

  measure: async <T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<{ result: T; duration: number }> => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (__DEV__) {
      console.log(`[PerfTest] ${label}: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  },
};

/**
 * Memory usage tracker (rough estimation)
 */
export const memoryTracker = {
  formatBytes: (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  },

  estimateObjectSize: (obj: any): number => {
    const objectList: any[] = [];
    const stack: any[] = [obj];
    let bytes = 0;

    while (stack.length) {
      const value = stack.pop();

      if (typeof value === "boolean") {
        bytes += 4;
      } else if (typeof value === "string") {
        bytes += value.length * 2;
      } else if (typeof value === "number") {
        bytes += 8;
      } else if (typeof value === "object" && value !== null) {
        if (objectList.indexOf(value) === -1) {
          objectList.push(value);

          if (Array.isArray(value)) {
            stack.push(...value);
          } else {
            for (const prop in value) {
              stack.push(value[prop]);
            }
          }
        }
      }
    }
    return bytes;
  },

  logEstimate: (label: string, obj: any) => {
    if (__DEV__) {
      const bytes = memoryTracker.estimateObjectSize(obj);
      console.log(`[MemTracker] ${label}: ${memoryTracker.formatBytes(bytes)}`);
    }
  },
};

/**
 * Search performance analyzer
 */
export const searchAnalyzer = {
  analyze: (
    query: string,
    entries: PasswordEntry[],
  ): { results: PasswordEntry[]; duration: number } => {
    const start = performance.now();
    const lowerQuery = query.toLowerCase();

    const results = entries.filter(
      (entry) =>
        entry.title?.toLowerCase().includes(lowerQuery) ||
        entry.username?.toLowerCase().includes(lowerQuery) ||
        entry.notes?.toLowerCase().includes(lowerQuery),
    );

    const duration = performance.now() - start;

    if (__DEV__) {
      console.log(
        `[SearchAnalyzer] Query: "${query}", Found: ${results.length}, Time: ${duration.toFixed(2)}ms`,
      );
    }

    return { results, duration };
  },
};
