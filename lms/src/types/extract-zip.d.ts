/**
 * What this file does
 * - Minimal TypeScript typings for `extract-zip`.
 *
 * Why this exists
 * - Some versions of `extract-zip` do not ship TS types.
 * - Keeping a tiny local type definition avoids an extra `@types/*` dependency.
 *
 * How to change it
 * - If you upgrade to a version of `extract-zip` that ships types, you can delete this file.
 */

declare module "extract-zip" {
  export type ExtractZipOptions = {
    dir: string;
    onEntry?: (entry: unknown) => void;
  };

  export default function extractZip(
    zipPath: string,
    opts: ExtractZipOptions
  ): Promise<void>;
}

