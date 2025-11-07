#!/usr/bin/env node
/**
 * Relume Component Scraper
 *
 * Phase 1: Discovery - Scrapes listing pages to build catalog
 * Phase 2: Download - Downloads components, code, and images
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface ComponentInfo {
  name: string;
  slug: string; // e.g., "navbar-1"
  category: string; // e.g., "Marketing"
  subcategory: string; // e.g., "Navbars"
  url: string;
  metadata?: {
    reactVersion?: string;
    tailwindVersion?: string;
    lastUpdated?: string;
  };
}

interface Catalog {
  totalComponents: number;
  discoveredAt: string;
  components: ComponentInfo[];
}

interface Progress {
  completed: string[]; // Array of slugs
  failed: string[];
  lastUpdated: string;
}

const BASE_URL = 'https://www.relume.io';
const LISTING_URL = `${BASE_URL}/react/components`;
const DELAY_MS = 2000; // 2 second delay between requests

const CATALOG_FILE = './catalog.json';
const PROGRESS_FILE = './progress.json';
const COMPONENTS_DIR = './components';

// Helper: Execute browser automation command
async function browserCommand(command: string): Promise<any> {
  try {
    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);

    if (!result.success) {
      throw new Error(result.error || result.message);
    }

    return result;
  } catch (error: any) {
    console.error(`Browser command failed: ${error.message}`);
    throw error;
  }
}

// Helper: Delay execution
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Load or create catalog
async function loadCatalog(): Promise<Catalog> {
  try {
    const data = await fs.readFile(CATALOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      totalComponents: 0,
      discoveredAt: new Date().toISOString(),
      components: []
    };
  }
}

// Helper: Save catalog
async function saveCatalog(catalog: Catalog): Promise<void> {
  await fs.writeFile(CATALOG_FILE, JSON.stringify(catalog, null, 2));
  console.log(`✓ Catalog saved: ${catalog.components.length} components`);
}

// Helper: Load or create progress
async function loadProgress(): Promise<Progress> {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      completed: [],
      failed: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

// Helper: Save progress
async function saveProgress(progress: Progress): Promise<void> {
  progress.lastUpdated = new Date().toISOString();
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Helper: Ensure directory exists
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// Helper: Sanitize filename
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, '');
}

// Helper: Convert slug to PascalCase component name
function toPascalCase(slug: string): string {
  // navbar-1 -> Navbar1
  return slug
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

// Helper: Convert component name to slug
function nameToSlug(name: string): string {
  // "Application Shell 1" -> "application-shell-1"
  return name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * PHASE 1: DISCOVERY
 * Scrape listing pages to discover all components
 */
async function discoverComponents(maxPages: number = 32): Promise<Catalog> {
  console.log('🔍 Starting discovery phase...');
  console.log(`   Target: ${maxPages} pages`);

  const catalog: Catalog = {
    totalComponents: 0,
    discoveredAt: new Date().toISOString(),
    components: []
  };

  // Navigate to listing page
  console.log(`\n📄 Navigating to ${LISTING_URL}...`);
  await browserCommand(`browser navigate "${LISTING_URL}"`);
  await delay(3000); // Wait for page load

  // Extract category structure from sidebar
  console.log('📂 Extracting categories...');
  const categoriesResult = await browserCommand(`browser extract "get all category names and subcategory names from the left sidebar navigation" '{"categories": "string"}'`);
  console.log('   Categories:', categoriesResult.message);

  // Iterate through pages
  for (let page = 1; page <= maxPages; page++) {
    console.log(`\n📄 Page ${page}/${maxPages}...`);

    try {
      // Extract component cards from current page
      const extractResult = await browserCommand(
        `browser extract "get all component names from the component cards visible on this page" '{"components": "string"}'`
      );

      console.log(`   Found data:`, extractResult.message?.substring(0, 200));

      // Parse the extracted data
      try {
        // Extract JSON from message (format: "Successfully extracted data: {json}")
        const jsonMatch = extractResult.message.match(/\{.*\}/s);
        if (!jsonMatch) {
          throw new Error('No JSON found in extraction result');
        }

        const extractedData = JSON.parse(jsonMatch[0]);
        const componentsText = extractedData.components;

        // Try to parse as JSON array first
        let componentNames: string[] = [];
        try {
          const parsed = JSON.parse(componentsText);
          if (Array.isArray(parsed)) {
            componentNames = parsed.map((item: any) => item.name || item);
          }
        } catch {
          // If not JSON, try to extract component names from text
          const matches = componentsText.match(/([A-Z][a-z]+\s*(?:[A-Z][a-z]+)*\s*\d+)/g);
          if (matches) {
            componentNames = matches;
          }
        }

        // Add components to catalog
        for (const name of componentNames) {
          const slug = nameToSlug(name);
          const url = `${BASE_URL}/react-components/${slug}`;

          // Try to determine category from component name
          let category = 'Unknown';
          let subcategory = name.replace(/\s*\d+$/, '').trim();

          // TODO: Better category detection
          if (subcategory.includes('Application Shell')) {
            category = 'Application UI';
            subcategory = 'Application Shells';
          } else if (subcategory.includes('Navbar')) {
            category = 'Marketing';
            subcategory = 'Navbars';
          } else if (subcategory.includes('Blog')) {
            category = 'Marketing';
            subcategory = 'Blogs';
          } else if (subcategory.includes('Banner')) {
            category = 'Marketing';
            subcategory = 'Banners';
          }

          catalog.components.push({
            name,
            slug,
            category,
            subcategory,
            url
          });
        }

        console.log(`   ✓ Added ${componentNames.length} components`);

      } catch (parseError: any) {
        console.error(`   ✗ Failed to parse extraction:`, parseError.message);
      }

      // Navigate to next page if not last
      if (page < maxPages) {
        console.log('   → Navigating to next page...');
        await browserCommand(`browser act "click the next page button"`);
        await delay(DELAY_MS);
      }

    } catch (error: any) {
      console.error(`   ✗ Error on page ${page}:`, error.message);
      continue;
    }
  }

  catalog.totalComponents = catalog.components.length;
  await saveCatalog(catalog);

  console.log(`\n✅ Discovery complete: ${catalog.totalComponents} components found`);
  return catalog;
}

/**
 * PHASE 2: DOWNLOAD
 * Download components, code, and images
 */
async function downloadComponents(catalog: Catalog): Promise<void> {
  console.log('\n📥 Starting download phase...');
  console.log(`   Total components: ${catalog.totalComponents}`);

  const progress = await loadProgress();
  const remaining = catalog.components.filter(
    c => !progress.completed.includes(c.slug) && !progress.failed.includes(c.slug)
  );

  console.log(`   Already completed: ${progress.completed.length}`);
  console.log(`   Failed: ${progress.failed.length}`);
  console.log(`   Remaining: ${remaining.length}`);

  for (let i = 0; i < remaining.length; i++) {
    const component = remaining[i];
    console.log(`\n[${i + 1}/${remaining.length}] ${component.name} (${component.slug})`);

    try {
      // Navigate to component page
      const componentUrl = `${BASE_URL}/react-components/${component.slug}`;
      console.log(`   → Navigating to ${componentUrl}`);
      await browserCommand(`browser navigate "${componentUrl}"`);
      await delay(2000);

      // Click React tab
      console.log('   → Clicking React tab...');
      await browserCommand(`browser act "click the React tab"`);
      await delay(3000); // Wait longer for code to load

      // Extract React code
      console.log('   → Extracting React code...');
      const codeResult = await browserCommand(
        `browser extract "get the text content from the code block element - the complete source code shown in the pre or code element" '{"code": "string"}'`
      );
      const codeMatch = codeResult.message.match(/\{.*\}/s);
      if (!codeMatch) throw new Error('No code JSON found');
      const code = JSON.parse(codeMatch[0]).code;

      // Extract metadata from Details panel
      console.log('   → Extracting metadata...');
      const metadataResult = await browserCommand(
        `browser extract "get category, last updated date, react version, and tailwind version from the Details panel" '{"category": "string", "lastUpdated": "string", "reactVersion": "string", "tailwindVersion": "string"}'`
      );
      const metadataMatch = metadataResult.message.match(/\{.*\}/s);
      if (!metadataMatch) throw new Error('No metadata JSON found');
      const metadata = JSON.parse(metadataMatch[0]);

      // Click Image tab to get preview
      console.log('   → Getting preview image...');
      await browserCommand(`browser act "click the Image tab"`);
      await delay(1000);

      // Take screenshot of preview
      const screenshotResult = await browserCommand('browser screenshot');
      const screenshotPath = screenshotResult.screenshot;

      // Create directory structure
      const categoryDir = path.join(
        COMPONENTS_DIR,
        sanitizeFilename(component.category.toLowerCase()),
        sanitizeFilename(component.subcategory.toLowerCase())
      );
      await ensureDir(categoryDir);

      // Save component file
      const componentName = toPascalCase(component.slug);
      const componentPath = path.join(categoryDir, `${componentName}.tsx`);
      const metadataHeader = `/**
 * ${component.name}
 * @source ${componentUrl}
 * @category ${metadata.category || component.category}
 * @subcategory ${component.subcategory}
 * @react ${metadata.reactVersion || 'Unknown'}
 * @tailwind ${metadata.tailwindVersion || 'Unknown'}
 * @updated ${metadata.lastUpdated || 'Unknown'}
 */

`;
      await fs.writeFile(componentPath, metadataHeader + code);
      console.log(`   ✓ Saved: ${componentPath}`);

      // Copy screenshot to component directory
      const imagePath = path.join(categoryDir, `${componentName}.png`);
      await fs.copyFile(screenshotPath, imagePath);
      console.log(`   ✓ Saved: ${imagePath}`);

      // Update progress
      progress.completed.push(component.slug);
      await saveProgress(progress);

      // Delay before next component
      if (i < remaining.length - 1) {
        console.log(`   ⏱  Waiting ${DELAY_MS}ms...`);
        await delay(DELAY_MS);
      }

    } catch (error: any) {
      console.error(`   ✗ Failed:`, error.message);
      progress.failed.push(component.slug);
      await saveProgress(progress);
    }
  }

  console.log('\n✅ Download phase complete!');
  console.log(`   Completed: ${progress.completed.length}`);
  console.log(`   Failed: ${progress.failed.length}`);
}

/**
 * MAIN
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'discover':
        const maxPages = parseInt(args[1]) || 32;
        await discoverComponents(maxPages);
        break;

      case 'download':
        const catalog = await loadCatalog();
        if (catalog.components.length === 0) {
          console.error('❌ No components in catalog. Run discovery first.');
          process.exit(1);
        }
        await downloadComponents(catalog);
        break;

      case 'all':
        const discoveredCatalog = await discoverComponents();
        await downloadComponents(discoveredCatalog);
        break;

      default:
        console.log(`
Relume Component Scraper

Usage:
  npm run scrape:discover [pages]  - Discover components (default: 32 pages)
  npm run scrape:download          - Download discovered components
  npm run scrape:all               - Discover + download everything

Examples:
  npm run scrape:discover 2        - Test with first 2 pages
  npm run scrape:download          - Download from existing catalog
  npm run scrape:all               - Full scrape
        `);
        process.exit(1);
    }

    // Close browser when done
    await browserCommand('browser close');
    console.log('\n✅ All done!');

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    try {
      await browserCommand('browser close');
    } catch {}
    process.exit(1);
  }
}

main();
