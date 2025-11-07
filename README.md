# Relume Component Scraper

Automated scraper to download all 1524 Relume React components with their code, images, and metadata.

## Setup

Already complete! The scraper is ready to use.

## Usage

### Phase 1: Discover Components (32 pages)
```bash
npm run scrape:discover        # Discover all components
npm run scrape:discover:test   # Test with 2 pages only
```

Creates `catalog.json` with all component URLs and metadata.

### Phase 2: Download Components
```bash
npm run scrape:download        # Download from catalog
```

Downloads components to `components/{category}/{subcategory}/{ComponentName}.tsx`

### Run Full Scrape
```bash
npm run scrape:all             # Discover + download everything
npm run scrape:all:test        # Test with 2 pages only
```

## Features

- **Progress tracking**: Resume interrupted scrapes via `progress.json`
- **Rate limiting**: 2s delay between requests
- **Error handling**: Failed components logged, scraping continues
- **Organized structure**: Components saved by category/subcategory
- **Images included**: Preview PNG saved alongside each component
- **Metadata headers**: Component files include source, category, versions

## File Structure

```
relume/
├── components/
│   ├── marketing/
│   │   ├── navbars/
│   │   │   ├── Navbar1.tsx
│   │   │   ├── Navbar1.png
│   │   │   └── ...
│   │   ├── banners/
│   │   └── ...
│   ├── ecommerce/
│   └── application-ui/
├── catalog.json      # All discovered components
├── progress.json     # Download tracking
└── scraper.ts        # Main script
```

## Estimated Time

- **Discovery**: ~3-5 minutes (32 pages)
- **Download**: ~50-90 minutes (1524 components × 2-3s each)
- **Total**: ~1-1.5 hours for full scrape

## Notes

- Some components may fail with AWS S3 AccessDenied errors
- Failed components tracked in `progress.json`
- Scraper can be stopped/resumed anytime
- Browser automation runs in background
