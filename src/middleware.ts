import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Host policy:
 *
 *   - blujaylogistic.com, www.blujaylogistic.com  → platform (marketing + admin)
 *   - {sub}.blujaylogistic.com                    → white-label tenant portal
 *   - localhost, {sub}.localhost                  → local development
 *   - *.vercel.app (this project only)            → preview / production builds
 *
 * Everything else gets a 403 with the unauthorized template below. This is the
 * outermost gate — actual tenant resolution (subdomain → tenantId, 404 on
 * missing/inactive tenant) happens in the server-side layout of the (client)
 * route group, because middleware runs in Edge runtime which cannot use
 * firebase-admin.
 *
 * Middleware annotates the request with parsed host metadata via two headers
 * so downstream handlers don't have to re-parse:
 *
 *   x-blujay-host          → raw hostname (no port)
 *   x-blujay-subdomain     → extracted subdomain when host is *.blujaylogistic.com,
 *                            or empty string for apex / www / preview / localhost root
 */

const APEX = 'blujaylogistic.com';

const ALLOWED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

interface HostDecision {
    allowed: boolean;
    hostname: string;
    subdomain: string;        // '' when this is the apex, www, preview, or localhost root
}

function evaluateHost(rawHost: string): HostDecision {
    const hostname = (rawHost.split(':')[0] || '').toLowerCase();

    // Apex / www
    if (hostname === APEX || hostname === `www.${APEX}`) {
        return { allowed: true, hostname, subdomain: '' };
    }

    // Subdomain on the apex: foo.blujaylogistic.com → 'foo'
    if (hostname.endsWith(`.${APEX}`)) {
        const subdomain = hostname.slice(0, -(APEX.length + 1));
        // Guard against multi-segment subdomains (foo.bar.blujaylogistic.com).
        // We only support single-label tenant subdomains.
        if (subdomain.includes('.')) {
            return { allowed: false, hostname, subdomain: '' };
        }
        return { allowed: true, hostname, subdomain };
    }

    // Localhost / IP (dev). Accepts {sub}.localhost too.
    if (ALLOWED_LOCAL_HOSTS.has(hostname)) {
        return { allowed: true, hostname, subdomain: '' };
    }
    if (hostname.endsWith('.localhost')) {
        const subdomain = hostname.slice(0, -'.localhost'.length);
        if (subdomain.includes('.')) {
            return { allowed: false, hostname, subdomain: '' };
        }
        return { allowed: true, hostname, subdomain };
    }

    // Vercel preview / production builds — restricted to this project's
    // deployments. Subdomain extraction is N/A for previews; they use the
    // apex routing.
    if (hostname.endsWith('.vercel.app')) {
        if (
            hostname.includes('courierhub-blujay-logistics') ||
            hostname.includes('bhargavs-projects')
        ) {
            return { allowed: true, hostname, subdomain: '' };
        }
        return { allowed: false, hostname, subdomain: '' };
    }

    return { allowed: false, hostname, subdomain: '' };
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
    const rawHost = request.headers.get('host') || '';
    const decision = evaluateHost(rawHost);

    if (!decision.allowed) {
        return new NextResponse(BLOCKED_HTML, {
            status: 403,
            headers: {
                'Content-Type': 'text/html',
                'X-Robots-Tag': 'noindex',
            },
        });
    }

    // Tenant subdomains MUST never be indexed by search engines — robots will
    // dilute the brand and leak tenant identities. Apex stays indexable.
    const isTenantSubdomain = decision.subdomain.length > 0;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-blujay-host', decision.hostname);
    requestHeaders.set('x-blujay-subdomain', decision.subdomain);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });

    if (isTenantSubdomain) {
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    return response;
}

// Run middleware on ALL routes
export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
