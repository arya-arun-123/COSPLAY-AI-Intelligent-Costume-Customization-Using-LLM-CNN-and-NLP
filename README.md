# AI-Powered Brand-Aware Clothing Customization System

A generative AI platform that lets users design personalized clothing using natural-language prompts and reference images, get a brand-accurate size recommendation grounded in real brand sizing data, and keep garments true to a selected brand's standard sizing.

## Abstract

Existing fashion platforms mostly offer predefined designs and fixed sizes, leaving little room for personalization, and they rarely reconcile a customer's own measurements — or the size they wear in one brand — with a *different* brand's sizing standard. This project lets users describe the garment changes they want (type, color, style, artwork, specific measurements) in plain language, or provide their body measurements / a size they already own, and the system:

1. Parses the free-form prompt with an LLM (with a deterministic rule-based NLP fallback) to extract structured customization data — garment type, color, fit, style, and design details.
2. Looks up the selected brand's standard measurements from a PostgreSQL database, and retrieves brand/garment-specific sizing knowledge (fit notes, brand quirks) from a Retrieval-Augmented Generation (RAG) knowledge base built over brand size-chart documents.
3. Runs a deterministic Size Engine that scores every available size against the user's measurements (or against the measurements of a size they already wear in another brand) to recommend the best-fitting size, and flags likely alterations.
4. Generates a natural-language explanation of the size recommendation with Gemini, grounded in the RAG context and the Size Engine's own output (never overriding it).
5. Feeds the design requirements and a reference image to a generative AI image model to produce a visual of the customized garment.
6. Supports iterative refinement, so users can keep adjusting the design with follow-up prompts, and saves the finished design with its calculated measurement alterations.

## Problem Statement

Standard sizes vary between brands, and most platforms can't reconcile a user's natural-language customization request — or their measurements in *one* brand — with a *different* brand's sizing standard. Customers are stuck choosing between rigid presets, manual and error-prone measurement entry, or guessing whether "their usual size" will fit in a brand they've never worn. This system combines NLP/LLM prompt parsing, a brand-specific measurement database, a RAG knowledge base of brand sizing documents, a deterministic size-matching engine, and generative AI image synthesis to close that gap: interpreting free-form requests, grounding size recommendations in real brand data and retrieved context, and rendering the customized result visually.

> **Note on scope:** the standard sizing/fit logic in this system is a deterministic, rule-based Size Engine plus LLM/RAG-grounded reasoning over structured brand data — not a computer-vision/CNN body-measurement model. Image understanding is not currently part of the pipeline; garment images are *generated* (not analyzed) via Gemini.

## JIRA DASHBOARD LINK

https://ananthakrishnanm010.atlassian.net/jira/software/projects/COS/boards/34/backlog

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Axios |
| Backend (main API) | Express (Node.js 20), JWT authentication, Multer uploads, Prisma ORM |
| AI backend (RAG microservice) | Express service (port 8000) exposing `/api/rag/retrieve`, wired into the main API's size-recommendation flow |
| Database | PostgreSQL with the `pgvector` extension (`pgvector/pgvector` image), Prisma ORM for structured data, raw `pgvector` cosine-similarity SQL for RAG retrieval |
| AI — language (parsing) | LLM-based prompt parsing via Gemini (`@google/genai`), with a deterministic rule-based NLP extractor as an offline fallback |
| AI — language (size reasoning) | Retrieval-Augmented Generation: Gemini embeddings (`gemini-embedding-001`) over brand/garment size documents, retrieved via `pgvector` cosine similarity, and a Gemini-generated natural-language explanation layer over the Size Engine's result |
| AI — sizing | Deterministic Size Engine (rule-based scoring across chest/waist/hip/shoulder/sleeve/inseam/rise, garment-aware, fit-preference aware, unit-normalizing) |
| AI — image | Reference-guided garment image generation via Cloudflare Workers AI (FLUX.2 klein) — the default/main provider — with Gemini (`gemini-3.1-flash-image`) available as an optional alternate provider |
| Testing | Playwright end-to-end tests (`front-end/tests`), Node's built-in test runner for services (`sizeEngineTest.js`, LLM service unit tests) |
| Infrastructure | Docker Compose (Postgres + pgvector, main API server, AI/RAG backend, client) |

## Architecture Overview

```
React client (:5173)
   │
   ▼
Express API server (:5000)
   ├── Auth, Products, Cart, Orders ──────► PostgreSQL
   ├── Brand & Size API ──────────────────► PostgreSQL (brand/measurement data)
   ├── Reference Image Upload ────────────► local disk (uploads/reference-images)
   ├── Custom Design API ─────────────────► measurement calculation + PostgreSQL
   ├── Size Recommendation API ───────────► Size Engine (deterministic)
   │      ├── retrieves brand context ───► AI/RAG backend (:8000) ──► pgvector similarity search
   │      └── generates explanation ─────► Gemini (recommendationExplanationService)
   ├── LLM Prompt Parsing API ────────────► Gemini (llmParserService), rule-based NLP fallback
   └── AI Generation API ─────────────────► generateDesignImage()
                                              ├── cloudflareService (default, Workers AI, FLUX.2 klein)
                                              └── geminiService (optional, Gemini image model)

AI / RAG backend (:8000)
   └── POST /api/rag/retrieve ────────────► Gemini embeddings (gemini-embedding-001)
                                              └── cosine-similarity search over RagDocument (pgvector)
```

**Flow:** pick garment type → pick brand & size, or enter body measurements, or reference a size worn in another brand → the Size Recommendation API combines structured brand data, RAG-retrieved brand/fit context, and the deterministic Size Engine to recommend a size, with a Gemini-generated grounded explanation → adjust measurements / describe the design and attach a reference image → the API server calls the configured image provider (Cloudflare Workers AI / FLUX.2 klein by default, with Gemini available as an optional alternate) to generate the customized garment image, using the reference image and prompt → the design and its calculated alterations are saved → result shown to user, refinable via further prompts. Free-form prompt parsing into structured fields (color, fit, style, garment, design) is available via a dedicated LLM parsing endpoint with a rule-based fallback; it is not yet called automatically as part of the image-generation request from the client UI.

## Project Structure

```
.
├── docker-compose.yml
├── LICENSE
├── back-end/                          # AI / RAG microservice (wired in, no longer a scaffold)
│   └── app/
│       ├── app.js                     # Express app: /health, POST /api/rag/retrieve
│       ├── server.js
│       └── services/ragService.js     # Gemini embeddings + pgvector cosine-similarity retrieval
└── front-end/
    ├── client/                        # React + Vite app
    │   └── src/
    │       ├── pages/AIDesignPage.jsx # garment → size recommendation → design → save flow
    │       ├── pages/SavedDesignsPage.jsx, DesignDetailsPage.jsx
    │       └── ...                    # components, features, contexts, services
    ├── server/                        # Express main API
    │   ├── prisma/                    # schema, migrations (Brand, BrandSize, CustomDesign, RagDocument, ...)
    │   ├── data/                      # brand/garment size CSVs (dress, hoodie, jeans, shirts, tshirts)
    │   ├── scripts/                   # ingest-rag.js, import-garment-data.js, seed-garment-base.js
    │   ├── tests/                     # sizeEngineTest.js
    │   └── src/
    │       ├── routes/
    │       │   ├── aiGenerationRoutes.js      # POST /api/v1/generate-design
    │       │   ├── sizeRoutes.js              # size measurements + size recommendation endpoints
    │       │   ├── customDesignRoutes.js      # save / list / fetch custom designs
    │       │   └── llmParserRoutes.js         # POST /api/v1/parse-customization
    │       ├── services/
    │       │   ├── imageService.js            # picks image provider from IMAGE_PROVIDER
    │       │   ├── cloudflareService.js        # Cloudflare Workers AI image generation (default)
    │       │   ├── geminiService.js            # Gemini image generation (optional alternate)
    │       │   ├── sizeEngineService.js        # deterministic size scoring engine
    │       │   ├── sizeRecommendationService.js
    │       │   ├── ragClientService.js         # calls the AI/RAG backend's /api/rag/retrieve
    │       │   ├── llmParserService.js         # Gemini prompt parser + rule-based fallback
    │       │   └── llm/                        # measurementExtractionService, recommendationExplanationService (+ tests)
    │       └── validators/customizationValidation.js
    ├── tests/                          # Playwright E2E specs (ai-design.spec.js, smoke.spec.js)
    └── shared/                         # constants shared by client and server
```

## Getting Started

### Prerequisites

- Node.js (v20+)
- Docker & Docker Compose
- PostgreSQL with the `pgvector` extension (if not running via Docker)
- A Cloudflare account ID + API token (Workers AI permission) — required for design-image generation, the default provider
- A Gemini API key (`GEMINI_API_KEY`) — required for prompt parsing, RAG embeddings, and recommendation explanations, and optionally for image generation if you switch `IMAGE_PROVIDER=gemini`

### Setup

1. Clone the repository
   ```bash
   git clone https://github.com/arya-arun-123/COSPLAY-AI-Intelligent-Costume-Customization-Using-LLM-CNN-and-NLP.git
   cd COSPLAY-AI-Intelligent-Costume-Customization-Using-LLM-CNN-and-NLP
   ```

2. Set environment variables. Copy the example files and fill in your values:
   ```bash
   cd front-end
   cp .env.example .env
   cp server/.env.example server/.env
   echo 'VITE_API_URL=http://localhost:5000/api/v1' > client/.env
   cd ../back-end
   cp .env.example .env
   cd ..
   ```
   Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to `front-end/server/.env` (used by the default image provider), and `GEMINI_API_KEY` to `front-end/server/.env` and `back-end/.env` (used for prompt parsing, RAG embeddings, recommendation explanations, and as the optional `IMAGE_PROVIDER=gemini` alternate).
   When using Docker, `.env` files are excluded from builds, so add `JWT_SECRET` and `GEMINI_API_KEY` (and any other AI provider keys you need) to the `server` and `ai-backend` services in `docker-compose.yml` instead (and change the default database password).

3. Start services with Docker Compose
   ```bash
   docker compose up --build
   ```

   Or run manually (start the AI/RAG backend separately):
   ```bash
   cd back-end && npm install && npm run dev &     # AI/RAG backend on :8000
   cd front-end
   npm install
   npm run dev          # starts client and server together
   ```

4. Run database migrations, seed brand data, and ingest the RAG knowledge base
   ```bash
   # Docker
   docker compose exec server npx prisma migrate deploy
   docker compose exec server node prisma/seed.cjs
   docker compose exec server npm run db:import-garments
   docker compose exec server npm run db:ingest-rag

   # Manual
   cd front-end/server
   npx prisma generate
   npx prisma migrate deploy
   node prisma/seed.cjs
   npm run db:import-garments
   npm run db:ingest-rag
   ```
   `npm run db:seed` adds demo users and products but deletes existing users, products, carts, and orders first.

The client runs at http://localhost:5173, the main API at http://localhost:5000, and the AI/RAG backend at http://localhost:8000.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL (pgvector-enabled) connection string, shared by the main API and the AI/RAG backend |
| `JWT_SECRET` | Secret used to sign auth tokens (required) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `PORT` | API server port (default `5000` for the main API, `8000` for the AI/RAG backend) |
| `CLIENT_URL` | Allowed CORS origin (default `http://localhost:5173`) |
| `VITE_API_URL` | API base URL used by the client |
| `RAG_SERVICE_URL` | Base URL the main API uses to reach the AI/RAG backend (default `http://ai-backend:8000`) |
| `IMAGE_PROVIDER` | Image generation backend: `cloudflare` (default) or `gemini` (optional alternate) |
| `CLOUDFLARE_ACCOUNT_ID` | Required for the default `cloudflare` image provider |
| `CLOUDFLARE_API_TOKEN` | Required for the default `cloudflare` image provider; needs Workers AI permission |
| `GEMINI_API_KEY` | Required on both the main API and the AI/RAG backend — used for prompt parsing, RAG embeddings, and size-recommendation explanations, and for image generation only if `IMAGE_PROVIDER=gemini` |
| `CLOUDFLARE_IMAGE_SIZE` | Optional, default `1024`; `512` uses far fewer free Neurons |

## API Overview

Base URL: `http://localhost:5000/api/v1`

| Endpoint | Description |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Create an account / log in |
| `GET /auth/me` | Get the current user |
| `GET /brands` | List supported brands |
| `GET /brands/:brandId/sizes` | Get available sizes for a brand |
| `GET /brands/:brandId/:garmentType/sizes` | Get sizes for a brand and garment type |
| `GET /sizes/:sizeId/measurements` | Retrieve standard measurements for a size |
| `POST /sizes/recommend` | Recommend a size from the user's own body measurements (Size Engine + RAG + Gemini explanation) |
| `POST /sizes/recommend-from-reference` | Recommend a target-brand size from a size the user already wears in another brand |
| `POST /parse-customization` | Parse a free-form design prompt into structured fields (Gemini, with rule-based fallback) |
| `POST /reference-images` | Upload a reference garment image |
| `POST /custom-designs` | Save a design and calculate measurement alterations |
| `GET /custom-designs`, `GET /custom-designs/:id` | List / fetch saved designs |
| `POST /generate-design` | Generate a customized garment image from a prompt, garment type, and (optional) reference image |
| `/products`, `/cart`, `/orders` | Storefront endpoints |

AI/RAG backend, base URL `http://localhost:8000`:

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /api/rag/retrieve` | Retrieve brand/garment sizing documents by cosine similarity over Gemini embeddings |

## Contributing

1. Create a feature branch from `main`
2. Run `npm run lint` and `npm run format` in `front-end/` before committing
3. Open a PR with a clear description of changes

## License

Distributed under the MIT License. See [LICENSE](LICENSE).
