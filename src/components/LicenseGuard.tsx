'use client';

import { useEffect, useState } from 'react';

const ALLOWED_HOSTNAMES = [
  'blujaylogistic.com',
  'www.blujaylogistic.com',
  'localhost',
  '127.0.0.1',
];

function isAuthorized(): boolean {
  if (typeof window === 'undefined') return true;
  const hostname = window.location.hostname;

  if (ALLOWED_HOSTNAMES.includes(hostname)) return true;

  // Allow owner's Vercel preview deployments
  if (
    hostname.endsWith('.vercel.app') &&
    (hostname.includes('courierhub-blujay-logistics') ||
      hostname.includes('bhargavs-projects'))
  ) {
    return true;
  }

  return false;
}

export default function LicenseGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(true); // SSR: assume authorized
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAuthorized(isAuthorized());
    setChecked(true);
  }, []);

  if (!checked) return <>{children}</>; // SSR pass-through

  if (!authorized) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0b',
          color: '#e4e4e7',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '48px 24px' }}>
          <svg
            width="64"
            height="64"
            style={{ margin: '0 auto 32px', display: 'block', opacity: 0.4 }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 12,
              color: '#fafafa',
            }}
          >
            Unauthorized Access
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#71717a' }}>
            This software is proprietary and licensed exclusively to Blujay Logistics.
            Running, copying, or distributing this application without authorization is
            strictly prohibited.
          </p>
          <p
            style={{
              marginTop: 32,
              fontSize: 13,
              color: '#3f3f46',
              fontFamily: 'monospace',
            }}
          >
            ERR_LICENSE_UNAUTHORIZED
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
