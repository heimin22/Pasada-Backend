# Migration from Node.js to Bun

This document outlines the changes made to migrate the Pasada Backend from Node.js to Bun.

## Changes Made

### 1. Package.json Updates
- Added `"type": "module"` to enable ES modules
- Added `"bun-types": "latest"` to devDependencies
- Updated all scripts to use `bun` instead of `node` or `npm`
- Changed engines requirement from Node.js to Bun
- Removed Node.js-specific dev dependencies (`nodemon`, `ts-node`, `ts-node-dev`)

### 2. Dockerfile Updates
- Changed base image from `node:23-stretch` to `oven/bun:1`
- Updated all commands to use `bun` instead of `npm` or `node`

### 3. TypeScript Configuration
- Updated `tsconfig.json` to use modern ES module settings:
  - Target: ES2022
  - Module: ESNext
  - Module resolution: bundler
  - Added Bun types support

### 4. Bun Configuration
- Created `bunfig.toml` for Bun-specific settings
- Configured test preload and timeout settings

## Benefits of Migration

1. **Performance**: Bun is significantly faster than Node.js for most operations
2. **Built-in TypeScript**: No need for ts-node or additional TypeScript tooling
3. **Built-in Test Runner**: Bun includes a fast test runner
4. **Better ES Module Support**: Native ES module support without additional configuration
5. **Smaller Bundle Size**: Bun produces smaller bundles

## Usage

### Development
```bash
bun run dev          # Start development server with hot reload
bun run build        # Build the project
bun run start        # Start production server
```

### Testing
```bash
bun test             # Run tests
bun test --watch     # Run tests in watch mode
bun test --coverage  # Run tests with coverage
```

### Package Management
```bash
bun install          # Install dependencies
bun add <package>    # Add a new dependency
bun remove <package> # Remove a dependency
```

## Notes

- All existing TypeScript code works without modification
- ES module imports/exports are now the default
- The project maintains compatibility with existing APIs and endpoints
- Docker deployment now uses the Bun runtime

## Additional Fixes Applied

### 5. Test Files Migration
- Converted all test files from CommonJS (`require()`) to ES modules (`import`)
- Updated imports for `axios`, `@supabase/supabase-js`, and `dotenv`
- Fixed TypeScript configuration to include Jest types

### 6. Package Dependencies
- Removed duplicate TypeScript dependency
- Fixed build script to use `bunx tsc` instead of `bun run tsc`
- Updated start script to use `bun` directly for compiled JavaScript
- Removed `package-lock.json` to avoid conflicts with Bun's lockfile

### 7. Deployment Configuration
- Fixed `.dockerignore` syntax (converted Windows backslashes to Unix forward slashes)
- Updated `fly.toml` to use Dockerfile builder instead of Heroku builder
- Removed Node.js-specific build arguments
- Fixed Dockerfile build process to handle postinstall scripts correctly
- Updated build script to be more explicit with TypeScript compilation

## Verification

The migration has been tested and verified to work correctly with:
- ✅ TypeScript compilation
- ✅ ES module loading
- ✅ Package.json configuration
- ✅ Bun runtime execution
- ✅ Server startup and basic functionality
- ✅ ES module imports in test files
- ✅ Build process with Bun
- ✅ Docker configuration for deployment
- ✅ Fly.io configuration updated for Bun
- ✅ All lockfile conflicts resolved
