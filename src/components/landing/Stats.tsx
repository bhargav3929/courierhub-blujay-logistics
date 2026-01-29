'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const duration = 2000;
    const start = Date.now();
    const timer = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(eased * target));
      if (p >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

const stats = [
  { value: 10, suffix: 'M+', label: 'shipments processed', sub: 'and counting' },
  { value: 28, suffix: 'K+', label: 'pin codes covered', sub: 'pan-India reach' },
  { value: 50, suffix: 'K+', label: 'active businesses', sub: 'trust our platform' },
  { value: 15, suffix: '+', label: 'courier partners', sub: 'integrated' },
];

export default function Stats() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[#f8fafc]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#0f172a]/[0.06] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#0f172a]/[0.06] to-transparent" />

      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative"
            >
              <div className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-[#0f172a] tracking-[-0.04em] leading-none mb-2">
                <Counter target={stat.value} suffix={stat.suffix} />
              </div>
              <div className="text-[13px] text-[#0f172a]/60 font-medium">{stat.label}</div>
              <div className="text-[11px] text-[#0f172a]/40 mt-0.5">{stat.sub}</div>

              {i < stats.length - 1 && (
                <div className="hidden lg:block absolute right-0 top-2 bottom-2 w-px bg-[#0f172a]/[0.06]" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
