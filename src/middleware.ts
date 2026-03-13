import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Allowed hostnames — only these can access the application.
 * Everything else gets blocked at the edge.
 */
const ALLOWED_HOSTS = new Set([
  'blujaylogistic.com',
  'www.blujaylogistic.com',
]);

const ALLOWED_LOCAL = new Set([
  'localhost',
  '127.0.0.1',
]);

function isAllowedHost(host: string): boolean {
  // Strip port for comparison
  const hostname = host.split(':')[0];

  // Exact match on production domains
  if (ALLOWED_HOSTS.has(hostname)) return true;

  // Local development (only works if license key is also valid)
  if (ALLOWED_LOCAL.has(hostname)) return true;

  // Vercel preview/production deployments (only the owner's project)
  if (hostname.endsWith('.vercel.app')) {
    // Only allow deployments from the owner's Vercel team
    if (
      hostname.includes('courierhub-blujay-logistics') ||
      hostname.includes('bhargavs-projects')
    ) {
      return true;
    }
    return false;
  }

  return false;
}

const BLOCKED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unauthorized</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0b;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container {
      text-align: center;
      max-width: 480px;
      padding: 48px 24px;
    }
    .lock {
      width: 64px;
      height: 64px;
      margin: 0 auto 32px;
      opacity: 0.4;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #fafafa;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #71717a;
    }
    .code {
      margin-top: 32px;
      font-size: 13px;
      color: #3f3f46;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <svg class="lock" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
    <h1>Unauthorized Access</h1>
    <p>This software is proprietary and licensed exclusively to Blujay Logistics. Running, copying, or distributing this application without authorization is strictly prohibited.</p>
    <p class="code">ERR_LICENSE_DOMAIN_MISMATCH</p>
  </div>
</body>
</html>`;

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  if (!isAllowedHost(host)) {
    return new NextResponse(BLOCKED_HTML, {
      status: 403,
      headers: {
        'Content-Type': 'text/html',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  return NextResponse.next();
}

// Run middleware on ALL routes
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
