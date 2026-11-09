// Waitlist API on Netlify. The logic lives in server/waitlist.mjs, shared with the local server.
import { createServicesFromEnv, runRoute } from '../../server/waitlist.mjs';

const services = createServicesFromEnv();

export default async (req) => {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, '');
  const result = await runRoute(pathname, services, {
    contentType: req.headers.get('content-type'),
    raw: await req.text(),
  });
  if (result.location) return new Response(null, { status: 303, headers: { Location: result.location } });
  return new Response(JSON.stringify(result.json), {
    status: result.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export const config = {
  path: ['/api/waitlist', '/api/waitlist/answers'],
  method: 'POST',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
