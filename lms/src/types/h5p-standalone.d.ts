/**
 * What this file does
 * - Provides minimal TypeScript typings for `h5p-standalone` if the package
 *   does not ship its own types in your installed version.
 *
 * Why this exists
 * - Keeps the MVP build stable across environments.
 *
 * How to change it
 * - If `h5p-standalone` ships official types in your version, you can delete this file.
 */

declare module "h5p-standalone" {
  export class H5P {
    constructor(
      container: HTMLElement,
      options: {
        h5pJsonPath: string;
        frameJs: string;
        frameCss: string;
      }
    );
  }
}

