# SigmaAI

### Autonomous AI Technology Publisher

SigmaAI is an autonomous AI technology publisher built for the ABTalks Autonomous AI Creator hackathon.

Instead of waiting for a user prompt, SigmaAI continuously discovers technology topics, evaluates their editorial value, checks previous publications through persistent memory, generates educational content, and publishes only topics that pass its decision pipeline.

## What SigmaAI Does

SigmaAI follows an autonomous pipeline:

Discovery
→ Deduplication
→ Material Delta
→ Editorial Scoring
→ Selection
→ Evidence Check
→ Generation
→ Memory
→ Publication

The system also records why topics were rejected, held, selected, and published.

## Key Features

- Autonomous technology topic discovery
- Multiple RSS/news sources
- Topic normalization and deduplication
- Material-delta detection for follow-up stories
- Editorial scoring and rejection
- Evidence checking
- AI-generated educational posts
- Persistent memory using PostgreSQL
- Duplicate publication prevention
- Transparent publishing rationale
- Activity logs
- Production dashboard
- Scheduled autonomous execution

## Architecture

- Next.js 16
- React
- TypeScript
- Prisma
- PostgreSQL / Supabase
- Groq API
- Vercel
- RSS / web sources

## Database

SigmaAI uses PostgreSQL through Prisma.

Core entities include:

- Agent
- AgentRun
- Topic
- Post
- Memory
- ActivityLog
- KnownEntity

## API

### Initialize Agent

`POST /api/agent/init`

Creates or initializes the SigmaAI agent.

### Run Agent

`POST /api/agent/run`

Executes an autonomous discovery and publishing cycle.

### Feed

`GET /api/agent/feed`

Returns the latest published intelligence.

## Autonomous Decision Making

SigmaAI does not generate a post for every discovered topic.

Each candidate passes through multiple stages:

1. Discovery
2. Deduplication
3. Material-delta analysis
4. Editorial evaluation
5. Evidence validation
6. Selection
7. Content generation
8. Memory creation
9. Publication

Weak or repetitive topics are rejected or held instead of being automatically published.

## Transparency

Every important decision is recorded through activity logs and exposed through the dashboard.

The dashboard shows:

- Topics discovered
- Topics rejected
- Topics held
- Topics published
- Selected topic
- Editorial rationale
- Evidence status
- Why the topic was selected
- Why it is relevant now
- Autonomous pipeline stages

## Live Demo

https://sigma-ai-psi.vercel.app/

## Repository

https://github.com/SBR2006V/sigma-ai

## AI-Assisted Development

SigmaAI was developed using AI-assisted programming and reasoning.

AI assistance was used for architecture, implementation, debugging, testing, prompt design, database design, deployment troubleshooting, and iterative refinement.

See `PROMPTS.md` for the AI-usage log.

## Hackathon

Built for:

**ABTalks Hackathon - Autonomous AI Creator**
