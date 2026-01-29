'use client';

import { motion } from 'framer-motion';
import { Rocket, Shield, Heart, Users } from 'lucide-react';

const values = [
  { icon: Rocket, title: 'Innovation', description: 'Pushing the boundaries of logistics technology.' },
  { icon: Shield, title: 'Reliability', description: '99.9% uptime. Consistent delivery performance.' },
  { icon: Heart, title: 'Customer first', description: 'Every feature built from real merchant pain points.' },
  { icon: Users, title: 'Transparency', description: 'No hidden charges. Real-time visibility at every step.' },
];

const milestones = [
  { year: '2022', event: 'Founded in Bangalore. First 100 merchants.' },
  { year: '2023', event: '1M shipments. 10+ courier partners integrated.' },
  { year: '2024', event: 'AI-powered allocation. Analytics platform launched.' },
  { year: '2025', event: '50K+ active businesses. 28K+ pin codes.' },
];

export default function About() {
  return (
    <section id="about" className="py-28 lg:py-36 bg-[#f8fafc] relative">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-24">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-[#3b82f6]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">About</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em] mb-6">
              We&apos;re building
              <br />the operating system
              <br />for Indian logistics.
            </h2>
          </div>

          <div className="lg:col-span-6 lg:col-start-7 space-y-6">
            <p className="text-[15px] text-[#0f172a]/55 leading-[1.8]">
              Blujay started with a simple observation: Indian e-commerce sellers waste hours every day
              comparing courier rates across different portals, manually entering shipment details, and
              chasing tracking updates. We built the platform we wished existed.
            </p>
            <p className="text-[15px] text-[#0f172a]/45 leading-[1.8]">
              Today, 50,000+ businesses — from single-seller Shopify stores to enterprise D2C brands —
              use Blujay to ship smarter. Our mission is to make logistics effortless, transparent, and
              accessible for every Indian business.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 mb-24">
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <v.icon className="h-5 w-5 text-[#0f172a]/40 mb-4" />
              <h4 className="text-sm font-semibold text-[#0f172a]/75 mb-1">{v.title}</h4>
              <p className="text-[12px] text-[#0f172a]/50 leading-relaxed">{v.description}</p>
            </motion.div>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-medium text-[#0f172a]/50 mb-8">Journey</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            <div className="hidden md:block absolute top-5 left-0 right-0 h-px bg-[#0f172a]/[0.06]" />

            {milestones.map((m, i) => (
              <motion.div
                key={m.year}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[#f8fafc] border-2 border-[#0f172a]/15 mb-4 relative z-10" />
                <div className="text-lg font-bold text-[#0f172a]/25 mb-1 font-mono">{m.year}</div>
                <p className="text-[12px] text-[#0f172a]/50 leading-relaxed">{m.event}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
