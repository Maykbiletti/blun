# Contributing to BLUN

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure your local database/Redis
4. Initialize the database: `npm run db:init`
5. Start the dev server: `npm run dev`

## Pull Requests

- Create a feature branch from `main`
- Keep changes focused -- one feature or fix per PR
- Add or update tests where applicable
- Make sure the server starts cleanly before submitting
- Write a clear PR description explaining what and why

## Code Style

- Plain ES5-compatible JavaScript (no transpilation needed)
- Use `var` and `function` declarations for consistency with the existing codebase
- Keep dependencies minimal -- only add a new package if truly necessary
- Document public functions with JSDoc comments

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce, expected behavior, and actual behavior
- Mention your Node.js version and OS

## Architecture

See the README for an overview. Key directories:

- `src/agent/` -- Agent runtime, tools, memory
- `src/routes/` -- REST API endpoints
- `src/models/` -- Database schema
- `src/` -- Core modules (db, redis, ws)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
