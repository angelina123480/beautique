'use strict';

/* Admin-only "store assistant" — answers analytics questions (best sellers,
   ratings, revenue, stock) by giving Claude read-only tools backed by
   lib/analytics.js, rather than hand-writing an intent parser for every
   phrasing of "what's selling well". */

const Anthropic = require('@anthropic-ai/sdk');
const analytics = require('./analytics');

let _client = null;
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = 'You are the internal store assistant on the Beautique admin dashboard. ' +
  'Answer questions about sales, products, and customers using only the tools provided — never guess ' +
  'or invent numbers. Give direct, concise answers with concrete figures (dollar amounts, counts, product ' +
  'names). If a question needs data no tool provides, say so plainly rather than speculating.';

const TOOLS = [
  {
    name: 'get_best_selling_products',
    description: 'Get the products with the most units sold — covers "best selling", "most purchased", "top sellers". Cancelled orders are excluded.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'How many products to return. Default 5.' },
        days: { type: 'integer', description: 'Only count sales from the last N days. Omit for all-time.' }
      }
    }
  },
  {
    name: 'get_top_rated_products',
    description: 'Get the products with the highest average customer review rating — covers "most liked", "best reviewed", "highest rated".',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'How many products to return. Default 5.' },
        minReviews: { type: 'integer', description: 'Only include products with at least this many reviews. Default 1.' }
      }
    }
  },
  {
    name: 'get_revenue_summary',
    description: 'Get total revenue, order count, and average order value. Cancelled orders are excluded.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Only count orders from the last N days. Omit for all-time totals.' }
      }
    }
  },
  {
    name: 'get_low_stock_products',
    description: 'Get products at or below a stock threshold, including fully sold-out ones — covers "running low", "what needs restocking".',
    input_schema: {
      type: 'object',
      properties: {
        threshold: { type: 'integer', description: 'Stock level to check against. Default 5.' }
      }
    }
  }
];

const HANDLERS = {
  get_best_selling_products: (input) => analytics.getBestSellingProducts(input),
  get_top_rated_products: (input) => analytics.getTopRatedProducts(input),
  get_revenue_summary: (input) => analytics.getRevenueSummary(input),
  get_low_stock_products: (input) => analytics.getLowStockProducts(input)
};

const MAX_TOOL_ITERATIONS = 5;

/** history: [{ role: 'user'|'assistant', text: string }, ...] — plain text
    turns only. Tool calls happen entirely within this one request/response
    and are never replayed back to the client, so callers don't need to
    serialize tool_use/tool_result blocks across requests. */
async function ask(message, history) {
  const client = getClient();
  const messages = (history || [])
    .map((entry) => ({ role: entry.role === 'assistant' ? 'assistant' : 'user', content: String(entry.text || '') }))
    .concat([{ role: 'user', content: message }]);

  try {
    return await runLoop(client, messages);
  } catch (err) {
    return friendlyErrorMessage(err);
  }
}

/* Anthropic API errors otherwise surface as raw JSON in the chat — this
   turns the couple of cases an admin will actually hit into something
   readable, without swallowing anything unexpected. */
function friendlyErrorMessage(err) {
  if (!(err instanceof Anthropic.APIError)) throw err;
  if (err.status === 401) return 'The Anthropic API key looks invalid — check ANTHROPIC_API_KEY.';
  if (err.status === 429) return 'Hit a rate limit talking to Claude — try again in a moment.';
  if (/credit balance/i.test(err.message || '')) {
    return 'The connected Anthropic account has no credit balance yet — add billing at console.anthropic.com to enable the assistant.';
  }
  return 'The assistant hit an error talking to Claude: ' + err.message;
}

async function runLoop(client, messages) {
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages
    });

    if (response.stop_reason === 'refusal') {
      return "I can't help with that one.";
    }
    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find((block) => block.type === 'text');
      return textBlock ? textBlock.text : "I don't have an answer for that.";
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const handler = HANDLERS[block.name];
      let result;
      try {
        result = handler ? await handler(block.input || {}) : { error: 'Unknown tool: ' + block.name };
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return "That took more digging than I could finish — try asking something more specific.";
}

module.exports = { isConfigured, ask };
