import { Router } from 'express';
import axios from 'axios';

const router = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DST_BASE = 'https://api.statbank.dk/v1';
const FT_BASE = 'https://oda.ft.dk/api';

/**
 * Wrap every route handler so unhandled promise rejections are forwarded to
 * the Express error middleware instead of crashing the process.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ---------------------------------------------------------------------------
// GET /dst/data
//
// Proxies a POST to Danmarks Statistik's /v1/data endpoint.
// Query params:
//   table     – required – e.g. "REGK11"
//   variables – optional – JSON string, e.g. [{"code":"Tid","values":["2024"]}]
//   format    – optional – "CSV" | "JSONSTAT" | "BULK" (default CSV)
// ---------------------------------------------------------------------------

router.get(
  '/dst/data',
  asyncHandler(async (req, res) => {
    const { table, variables, format } = req.query;

    if (!table) {
      return res
        .status(400)
        .json({ error: 'Query-parameter "table" er påkrævet.' });
    }

    let parsedVariables = [];
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch {
        return res.status(400).json({
          error:
            'Query-parameter "variables" skal være en gyldig JSON-streng.',
        });
      }
    }

    const body = {
      table,
      format: format || 'CSV',
      variables: parsedVariables,
    };

    const dstResponse = await axios.post(`${DST_BASE}/data`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      // DST returns CSV by default – pass through as-is
      responseType: 'text',
    });

    // Forward content type from DST
    const ct = dstResponse.headers['content-type'];
    if (ct) {
      res.set('Content-Type', ct);
    }

    return res.send(dstResponse.data);
  })
);

// ---------------------------------------------------------------------------
// GET /dst/tableinfo
//
// Proxies a POST to Danmarks Statistik's /v1/tableinfo endpoint.
// Query params:
//   table – required – e.g. "REGK11"
// ---------------------------------------------------------------------------

router.get(
  '/dst/tableinfo',
  asyncHandler(async (req, res) => {
    const { table } = req.query;

    if (!table) {
      return res
        .status(400)
        .json({ error: 'Query-parameter "table" er påkrævet.' });
    }

    const dstResponse = await axios.post(
      `${DST_BASE}/tableinfo`,
      { table },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );

    return res.json(dstResponse.data);
  })
);

// ---------------------------------------------------------------------------
// GET /ft/sager
//
// Proxies GET to Folketinget Open Data (ODA) /api/Sag.
// Query params (all optional):
//   typeid  – filter by case type id
//   search  – free text search
//   top     – number of results ($top)
//   orderby – order expression ($orderby)
// ---------------------------------------------------------------------------

router.get(
  '/ft/sager',
  asyncHandler(async (req, res) => {
    const { typeid, search, top, orderby } = req.query;

    const params = new URLSearchParams();
    params.set('$format', 'json');

    const filters = [];
    if (typeid) {
      filters.push(`typeid eq ${typeid}`);
    }
    if (search) {
      filters.push(`substringof('${search}', titel)`);
    }
    if (filters.length > 0) {
      params.set('$filter', filters.join(' and '));
    }
    if (top) {
      params.set('$top', top);
    }
    if (orderby) {
      params.set('$orderby', orderby);
    }

    const url = `${FT_BASE}/Sag?${params.toString()}`;

    const ftResponse = await axios.get(url, { timeout: 15000 });

    return res.json(ftResponse.data);
  })
);

// ---------------------------------------------------------------------------
// GET /ft/emneord
//
// Proxies GET to Folketinget Open Data (ODA) /api/Emneord.
// Returns the full list of parliamentary subject keywords.
// ---------------------------------------------------------------------------

router.get(
  '/ft/emneord',
  asyncHandler(async (req, res) => {
    const url = `${FT_BASE}/Emneord?$format=json`;

    const ftResponse = await axios.get(url, { timeout: 15000 });

    return res.json(ftResponse.data);
  })
);

// ---------------------------------------------------------------------------
// Error handling for proxy routes
// ---------------------------------------------------------------------------

router.use((err, _req, res, _next) => {
  console.error('[Proxy Error]', err.response?.data || err.message);

  // If the upstream API returned an error, forward its status
  if (err.response) {
    return res.status(err.response.status).json({
      error: 'Fejl fra ekstern API',
      upstream: {
        status: err.response.status,
        statusText: err.response.statusText,
        data:
          typeof err.response.data === 'string'
            ? err.response.data.substring(0, 500)
            : err.response.data,
      },
    });
  }

  // Network / timeout errors
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return res.status(504).json({
      error: 'Timeout ved kontakt til ekstern API.',
    });
  }

  return res.status(500).json({
    error: 'Uventet fejl i proxy-lag.',
    message:
      process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

export default router;
