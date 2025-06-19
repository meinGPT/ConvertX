# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ConvertX is a self-hosted online file converter supporting 1000+ formats. Built with TypeScript, Bun runtime, Elysia web framework, and server-side rendered HTML using @kitajs/html with JSX syntax.

## Development Commands

### Primary Development
- `bun run dev` - Development server with file watching
- `bun run hot` - Development server with hot reloading
- `bun run build` - Build Tailwind CSS

### Code Quality (run these before committing)
- `bun run lint` - Run all linting checks (TypeScript, ESLint, Prettier, Knip)
- `bun run format` - Auto-format all code
- `bun run lint:tsc` - TypeScript type checking only
- `bun run lint:eslint` - ESLint checks only
- `bun run lint:prettier` - Prettier formatting checks only
- `bun run lint:knip` - Unused code detection

## Architecture

### Core Structure
- `src/index.tsx` - Main application entry point (Elysia server)
- `src/converters/` - 15 different file conversion engines (FFmpeg, ImageMagick, Pandoc, etc.)
- `src/components/` - Reusable JSX components for UI
- `src/pages/` - Route handlers that return JSX
- `src/db/` - SQLite database schema and types
- `src/helpers/` - Utility functions
- `data/` - Runtime directory for uploads and SQLite database

### Technology Stack
- **Runtime**: Bun (not Node.js)
- **Web Framework**: Elysia
- **Frontend**: Server-side rendered JSX (@kitajs/html)
- **Database**: SQLite with Bun's built-in driver
- **Styling**: Tailwind CSS v4
- **Authentication**: JWT via @elysiajs/jwt

### Converter System
The app uses 15 different conversion tools orchestrated through `src/converters/`. Each converter handles specific file types:
- FFmpeg (video/audio) - ~472 input, ~199 output formats
- ImageMagick (images) - 245 input, 183 output formats
- Pandoc (documents) - 43 input, 65 output formats
- And 12 others for specialized formats

## Development Guidelines

### Code Standards
- Use conventional commits for commit messages
- TypeScript strict mode with custom JSX factory (@kitajs/html)
- 100 character line width (Prettier)
- Import sorting is automated
- All new code must pass TypeScript, ESLint, and Prettier checks

### Key Patterns
- JSX components use @kitajs/html (not React)
- Database queries use Bun's SQLite driver directly
- File uploads stored in `data/` directory
- Conversion jobs are queued and tracked in SQLite
- Authentication uses JWT tokens stored in cookies

### Testing
Currently no test framework is set up. This is listed as a todo item in the README.