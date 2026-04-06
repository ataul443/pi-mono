# Anthropic Server Tools — UI Reference

This document describes the data shapes produced by Anthropic server tools (web search, web fetch) as they appear in `AssistantMessage.content`, along with guidance for building UI components to render them.

## Overview

When the model is `anthropic-messages`, two server tools are automatically injected: `web_search` and `web_fetch`. These are executed server-side by Anthropic — the client never runs them. Their results appear as content blocks in the assistant message alongside regular `text`, `thinking`, and `toolCall` blocks.

### Streaming event

All server tool blocks arrive via a single event type:

```typescript
{
  type: "server_tool";
  contentIndex: number;
  content: ServerToolUseContent | WebSearchToolResult | WebFetchToolResult;
  partial: AssistantMessage;
}
```

This is emitted during `message_update` in the agent event flow.

---

## Content Block Types

### 1. `serverToolUse` — Tool invocation

Emitted when Claude decides to call a server tool. This is the equivalent of `toolCall` but for server-executed tools.

```typescript
interface ServerToolUseContent {
  type: "serverToolUse";
  id: string;        // e.g., "srvtoolu_014vSfpfJ6xcDuZSWbtsPswR"
  name: string;      // "web_search" | "web_fetch"
  input: Record<string, any>;
}
```

#### Web search input

```json
{
  "type": "serverToolUse",
  "id": "srvtoolu_014vSfpfJ6xcDuZSWbtsPswR",
  "name": "web_search",
  "input": {
    "query": "bureau.id"
  }
}
```

#### Web fetch input

```json
{
  "type": "serverToolUse",
  "id": "srvtoolu_02ABC...",
  "name": "web_fetch",
  "input": {
    "url": "https://httpbin.org/json"
  }
}
```

#### UI guidance

- Show a loading/activity indicator: "Searching web..." or "Fetching URL..."
- Display the query string (`input.query`) or URL (`input.url`)
- This block appears before the corresponding result block

---

### 2. `webSearchToolResult` — Search results

Contains the search results returned by Anthropic's server. Appears immediately after its corresponding `serverToolUse` block (matched by `toolUseId` === `serverToolUse.id`).

```typescript
interface WebSearchToolResult {
  type: "webSearchToolResult";
  toolUseId: string;
  results: WebSearchResult[];
  error?: { errorCode: string };
}

interface WebSearchResult {
  url: string;
  title: string;
  encryptedContent: string;  // opaque, do NOT display
  pageAge?: string;          // e.g., "1 week ago", "October 18, 2025"
}
```

#### Example (success)

```json
{
  "type": "webSearchToolResult",
  "toolUseId": "srvtoolu_014vSfpfJ6xcDuZSWbtsPswR",
  "results": [
    {
      "url": "https://bureau.id/",
      "title": "Bureau | Unified Risk Decisioning Platform",
      "encryptedContent": "EpQlCioIDhgC...",
      "pageAge": null
    },
    {
      "url": "https://www.linkedin.com/company/bureauidentity",
      "title": "Bureau | LinkedIn",
      "encryptedContent": "Eu4lCioIDhgC...",
      "pageAge": "1 week ago"
    }
  ]
}
```

#### Example (error)

```json
{
  "type": "webSearchToolResult",
  "toolUseId": "srvtoolu_...",
  "results": [],
  "error": {
    "errorCode": "too_many_requests"
  }
}
```

#### Error codes

| Code | Meaning |
|------|---------|
| `too_many_requests` | Rate limit exceeded |
| `invalid_input` | Invalid search query |
| `max_uses_exceeded` | Max search tool uses exceeded |
| `query_too_long` | Query exceeds max length |
| `unavailable` | Internal error |

#### UI guidance

- Display results as a list of clickable links with title and URL
- Show `pageAge` as a secondary label when present (e.g., "1 week ago")
- The list can be collapsible — default collapsed with a summary like "10 results from web search"
- `encryptedContent` is opaque encrypted data needed for multi-turn API round-tripping. Never display it. It can be very large.
- On error, show the error code with a user-friendly message
- Result count typically ranges from 5–10

---

### 3. `webFetchToolResult` — Fetched page content

Contains the content fetched from a URL. Appears after its corresponding `serverToolUse` block.

```typescript
interface WebFetchToolResult {
  type: "webFetchToolResult";
  toolUseId: string;
  url?: string;
  retrievedAt?: string;     // ISO 8601 timestamp
  content?: unknown;        // document block (see below)
  error?: { errorCode: string };
}
```

#### Example (success — text content)

```json
{
  "type": "webFetchToolResult",
  "toolUseId": "srvtoolu_02ABC...",
  "url": "https://httpbin.org/json",
  "retrievedAt": "2026-04-06T00:35:16.978Z",
  "content": {
    "type": "document",
    "source": {
      "type": "text",
      "media_type": "text/plain",
      "data": "Full text content of the page..."
    },
    "title": "Page Title",
    "citations": { "enabled": true }
  }
}
```

#### Example (success — PDF content)

```json
{
  "type": "webFetchToolResult",
  "toolUseId": "srvtoolu_...",
  "url": "https://example.com/paper.pdf",
  "retrievedAt": "2026-04-06T00:35:16.978Z",
  "content": {
    "type": "document",
    "source": {
      "type": "base64",
      "media_type": "application/pdf",
      "data": "JVBERi0xLjQK..."
    },
    "citations": { "enabled": true }
  }
}
```

#### Example (error)

```json
{
  "type": "webFetchToolResult",
  "toolUseId": "srvtoolu_...",
  "error": {
    "errorCode": "url_not_accessible"
  }
}
```

#### Error codes

| Code | Meaning |
|------|---------|
| `invalid_input` | Invalid URL format |
| `url_too_long` | URL exceeds 250 characters |
| `url_not_allowed` | Blocked by domain filtering |
| `url_not_accessible` | HTTP error fetching content |
| `too_many_requests` | Rate limit exceeded |
| `unsupported_content_type` | Not text or PDF |
| `max_uses_exceeded` | Max fetch uses exceeded |
| `unavailable` | Internal error |

#### UI guidance

- Show the fetched URL and retrieval timestamp
- The `content` field contains the full document and can be very large (10KB–500KB+). Do NOT render it inline by default.
- For text content: optionally offer an expandable preview (first ~500 chars)
- For PDF content: show a PDF icon/badge with the URL
- On error, show the error code with a user-friendly message

---

## Block Ordering in AssistantMessage.content

A typical web search response produces this sequence:

```
[0]  thinking              — Claude's initial reasoning about the query
[1]  serverToolUse         — Claude decides to search (name="web_search", input.query="...")
[2]  webSearchToolResult   — 5–10 search results with URLs and titles
[3]  thinking              — Claude reasons about the search results
[4+] text                  — Final answer text (may be split across multiple text blocks)
```

A web fetch response:

```
[0]  thinking              — Claude reasons about the URL
[1]  serverToolUse         — Claude decides to fetch (name="web_fetch", input.url="...")
[2]  webFetchToolResult    — Fetched page content
[3]  thinking              — Claude analyzes the content
[4+] text                  — Final answer
```

Combined search + fetch (Claude searches, then fetches a result):

```
[0]  thinking              — Initial reasoning
[1]  serverToolUse         — web_search
[2]  webSearchToolResult   — Search results
[3]  thinking              — Picks a URL to fetch
[4]  serverToolUse         — web_fetch
[5]  webFetchToolResult    — Fetched content
[6]  thinking              — Analyzes fetched content
[7+] text                  — Final answer
```

Multiple searches can occur in one response. Each `serverToolUse` is followed by its result block.

---

## Pause and Continuation

When the API pauses a long-running server tool execution, the response has `stopReason: "pauseTurn"`. The agent loop automatically handles this by resubmitting the conversation to continue.

During a pause, the assistant message may contain partial server tool blocks. The UI should show a "continuing..." indicator. This is transparent to the user — the agent loop handles it internally.

---

## Relationship to Regular Tool Calls

Server tool blocks are distinct from regular `toolCall` / `toolResult` blocks:

| | Regular tools | Server tools |
|---|---|---|
| Execution | Client-side (pi executes) | Server-side (Anthropic executes) |
| Content block type | `toolCall` | `serverToolUse` |
| Result block type | `toolResult` (separate message) | `webSearchToolResult` / `webFetchToolResult` (same message) |
| Agent loop | Extracts tool calls, executes, sends results | No extraction needed, results are inline |
| ID prefix | `toolu_` | `srvtoolu_` |

The agent loop only looks for `toolCall` blocks to execute. Server tool blocks are passed through transparently.

---

## TypeScript Types

All types are exported from `@mariozechner/pi-ai`:

```typescript
import type {
  ServerToolUseContent,
  WebSearchResult,
  WebSearchToolResult,
  WebFetchToolResult,
  ServerToolContent,    // union of all three
  AssistantMessage,
  AssistantMessageEvent,
} from "@mariozechner/pi-ai";
```

Type guard for server tool content:

```typescript
function isServerToolContent(block: AssistantMessage["content"][number]): block is ServerToolContent {
  return (
    block.type === "serverToolUse" ||
    block.type === "webSearchToolResult" ||
    block.type === "webFetchToolResult"
  );
}
```

---

## UI Component Suggestions

### Compact view (default)

```
🔍 Searched web: "bureau.id" — 10 results
```

```
🌐 Fetched: https://httpbin.org/json
```

### Expanded view

```
🔍 Searched web: "bureau.id"
  ├─ Bureau | Unified Risk Decisioning Platform — bureau.id
  ├─ Bureau | LinkedIn — linkedin.com (1 week ago)
  ├─ BUREAU Definition & Meaning — merriam-webster.com (1 week ago)
  └─ ... 7 more results
```

### Error view

```
⚠ Web search failed: too_many_requests
```

```
⚠ Could not fetch URL: url_not_accessible
```

### Streaming states

1. **`serverToolUse` received, no result yet** → Show spinner: "Searching web..." / "Fetching URL..."
2. **Result received** → Replace spinner with result summary
3. **Error in result** → Show error badge

---

## Citations

Web search results always include citations on the text blocks that reference them. Web fetch citations are available when `citations: { enabled: true }` is set on the tool.

Citations appear on `TextContent` blocks in the `citations` array. Each text block may have zero or more citations.

### Citation types

```typescript
/** Citation from a web search result. */
export interface WebSearchCitation {
  type: "web_search_result_location";
  url: string;              // source URL
  title?: string;           // page title
  citedText: string;        // up to ~150 chars of the cited source text
  encryptedIndex: string;   // opaque, needed for multi-turn round-tripping
}

/** Citation from a fetched document (char-based location). */
export interface CharLocationCitation {
  type: "char_location";
  documentIndex: number;    // index into the fetched documents
  documentTitle?: string;
  startCharIndex: number;
  endCharIndex: number;
  citedText: string;
}

/** Citation from a fetched PDF (page-based location). */
export interface PageLocationCitation {
  type: "page_location";
  documentIndex: number;
  documentTitle?: string;
  startPageNumber: number;
  endPageNumber: number;
  citedText: string;
}

export type Citation = WebSearchCitation | CharLocationCitation | PageLocationCitation;
```

### Example: text block with citations

```json
{
  "type": "text",
  "text": "Bureau is a no-code, identity decisioning platform that offers businesses the co...",
  "citations": [
    {
      "type": "web_search_result_location",
      "url": "https://www.linkedin.com/company/bureauidentity",
      "title": "Bureau | LinkedIn",
      "citedText": "Bureau is a no-code, identity decisioning platform that offe...",
      "encryptedIndex": "Eo8BCioIAhgB..."
    }
  ]
}
```

A single text block can have multiple citations:

```json
{
  "type": "text",
  "text": "Using Bureau's solution, companies have identified 20% more fake applications...",
  "citations": [
    {
      "type": "web_search_result_location",
      "url": "https://bureau.id/",
      "title": "Bureau | Unified Risk Decisioning Platform",
      "citedText": "Using Bureau's solution, we identified 20% more fake applications...",
      "encryptedIndex": "EpQl..."
    },
    {
      "type": "web_search_result_location",
      "url": "https://bureau.id/",
      "title": "Bureau | Unified Risk Decisioning Platform",
      "citedText": "Using Bureau's solution, we identified 20% more fake applications...",
      "encryptedIndex": "Eu4l..."
    }
  ]
}
```

### Text blocks without citations

Text blocks that don't reference search results have `citations: undefined` (field absent).

### UI guidance for citations

- Render cited text blocks with a visual indicator (superscript number, colored highlight, footnote marker)
- Show the source URL and title on hover or in a tooltip
- `citedText` contains ~150 chars of the original source text — useful for showing what was cited
- `encryptedIndex` is opaque — do not display, only needed for API round-tripping
- For `web_search_result_location`: link to the source URL
- For `char_location`: reference the fetched document by index
- For `page_location`: reference the PDF page range
- Citations arrive incrementally via `citations_delta` stream events — they accumulate on the text block during streaming
- Consider a "Sources" footer or sidebar that deduplicates citation URLs

---

## Data Size Considerations

- `encryptedContent` in search results: ~200–2000 bytes per result (opaque, never display)
- `content` in fetch results: 10KB–500KB+ (full page text or base64 PDF)
- These fields are needed for multi-turn round-tripping but should not be rendered
- When displaying assistant message content in session history, consider filtering or summarizing server tool blocks to avoid bloating the UI
