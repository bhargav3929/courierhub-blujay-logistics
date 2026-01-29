'use client';

import { motion } from 'framer-motion';

const row1 = ['Delhivery', 'BlueDart', 'DTDC', 'Ekart', 'Shadowfax', 'Xpressbees'];
const row2 = ['Ecom Express', 'Amazon Shipping', 'Gati', 'Rivigo', 'Professional Couriers', 'FedEx'];

function MarqueeRow({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-2">
      <motion.div
        animate={{ x: reverse ? ['0%', '-50%'] : ['-50%', '0%'] }}
        transition={{ duration: 35, repeat: Infinity, ease: 'linear' }}
        className="flex gap-4 whitespace-nowrap"
      >
        {doubled.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="flex-shrink-0 px-6 py-3 rounded-lg border border-[#0f172a]/[0.08] bg-[#0f172a]/[0.02] text-[#0f172a]/50 text-[13px] font-medium tracking-wide hover:text-[#0f172a]/70 hover:border-[#0f172a]/[0.15] hover:bg-[#0f172a]/[0.04] transition-all duration-500 cursor-default"
          >
            {name}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export default function Partners() {
  return (
    <section className="py-16 bg-white overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 mb-8">
        <div className="flex items-center gap-3">
          <div className="h-px w-8 bg-[#0f172a]/10" />
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#0f172a]/45">
            Integrated with India&apos;s top couriers
          </span>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-40 bg-gradient-to-r from-white to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-40 bg-gradient-to-l from-white to-transparent z-10" />
        <MarqueeRow items={row1} />
        <MarqueeRow items={row2} reverse />
      </div>
    </section>
  );
}
