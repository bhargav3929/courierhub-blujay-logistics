'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { useState } from 'react';

const linkGroups = [
  { title: 'Product', items: [{ label: 'Features', href: '#' }, { label: 'Integrations', href: '#' }, { label: 'API', href: '#' }] },
  { title: 'Company', items: [{ label: 'About', href: '#about' }, { label: 'Careers', href: '#' }, { label: 'Blog', href: '#' }, { label: 'Press', href: '#' }] },
  { title: 'Support', items: [{ label: 'Help Center', href: '#' }, { label: 'Contact', href: '#contact' }, { label: 'Status', href: '#' }] },
  { title: 'Legal', items: [{ label: 'Terms & Conditions', href: '/terms' }, { label: 'Privacy Policy', href: '/privacy' }, { label: 'Refunds', href: '#' }, { label: 'Shipping Policy', href: '#' }] },
];

export default function Footer() {
  const [email, setEmail] = useState('');

  return (
    <footer className="bg-white border-t border-[#0f172a]/[0.06]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 lg:gap-12">
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-5">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#06b6d4]">
                <Package className="h-4 w-4 text-white" />
              </div>
              <span className="text-[15px] font-semibold text-[#0f172a]/80">blujay</span>
            </Link>
            <p className="text-[12px] text-[#0f172a]/45 leading-relaxed mb-6 max-w-[240px]">
              India&apos;s smartest shipping platform. Compare, book, and track — all in one place.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); alert('Subscribed!'); setEmail(''); }}
              className="flex gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 px-3 py-2 bg-[#0f172a]/[0.03] border border-[#0f172a]/[0.08] rounded-lg text-[#0f172a] text-[12px] placeholder-[#0f172a]/30 focus:outline-none focus:border-[#3b82f6]/40"
              />
              <button type="submit" className="px-3 py-2 bg-[#0f172a]/[0.05] border border-[#0f172a]/[0.08] rounded-lg text-[#0f172a]/55 text-[11px] font-medium hover:bg-[#0f172a]/[0.1] transition-colors">
                Subscribe
              </button>
            </form>
          </div>

          {linkGroups.map((group) => (
            <div key={group.title}>
              <h4 className="text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/45 font-medium mb-4">{group.title}</h4>
              <ul className="space-y-2.5">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <Link href={item.href} className="text-[12px] text-[#0f172a]/40 hover:text-[#0f172a]/70 transition-colors">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-[#0f172a]/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-[#0f172a]/35">&copy; {new Date().getFullYear()} Blujay Logistics. All rights reserved.</p>
          <div className="flex gap-6">
            {['Twitter', 'LinkedIn', 'Instagram', 'YouTube'].map((s) => (
              <a key={s} href="#" className="text-[11px] text-[#0f172a]/35 hover:text-[#0f172a]/60 transition-colors">{s}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
