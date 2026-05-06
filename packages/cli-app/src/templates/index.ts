import type { StarterTemplateData, StarterTemplateId } from './types.js';
import { cliToolTemplate } from './cli-tool.js';
import { libraryTemplate } from './library.js';
import { monorepoTemplate } from './monorepo.js';
import { webAppTemplate } from './web-app.js';

const registry: Record<StarterTemplateId, StarterTemplateData> = {
  'web-app': webAppTemplate,
  library: libraryTemplate,
  'cli-tool': cliToolTemplate,
  monorepo: monorepoTemplate,
};

export type { StarterTemplateData, StarterTemplateId } from './types.js';
export { skillToMarkdown } from './skill-markdown.js';

export function getStarterTemplate(id: StarterTemplateId): StarterTemplateData {
  return registry[id];
}
