/// <reference types="vite/client" />

declare module "virtual:hexarch-specs" {
  export interface SpecFile {
    filename: string;
    content: string;
  }
  export const SPECS_DIR: string;
  const specs: SpecFile[];
  export default specs;
}
