'use client';

import { motion } from 'framer-motion';
import { BarChart3, GitCompare, MapPin, Wallet, Cpu, Truck, ArrowUpRight } from 'lucide-react';

const features = [
  {
    icon: GitCompare,
    title: 'Rate Comparison',
    description: 'Instantly compare prices across 15+ courier partners. Find the cheapest, fastest, or most reliable option for every single shipment.',
    tag: 'Core',
    size: 'large',
  },
  {
    icon: Truck,
    title: 'Multi-Carrier',
    description: 'Delhivery, BlueDart, DTDC, Ekart — all connected through a single integration.',
    tag: 'Integration',
    size: 'small',
  },
  {
    icon: MapPin,
    title: 'Live Tracking',
    description: 'Real-time shipment tracking with automated customer notifications.',
    tag: 'Visibility',
    size: 'small',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Deep insights into delivery performance, shipping costs, RTO rates, and courier benchmarks. Make data-driven decisions.',
    tag: 'Intelligence',
    size: 'large',
  },
  {
    icon: Wallet,
    title: 'Wallet & Billing',
    description: 'Prepaid wallet with instant top-up. Track every rupee spent on shipping.',
    tag: 'Finance',
    size: 'small',
  },
  {
    icon: Cpu,
    title: 'AI Auto-Allocate',
    description: 'Machine learning picks the best courier based on cost, speed, and past performance.',
    tag: 'AI',
    size: 'small',
  },
];

export default function Features() {
  return (
    <section className="py-28 lg:py-36 bg-[#f8fafc] relative">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-[#3b82f6]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Platform</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em]">
              Built different,
              <br />
              not decorated.
            </h2>
          </div>
          <div className="lg:col-span-4 lg:col-start-8 flex items-end">
            <p className="text-[15px] text-[#0f172a]/55 leading-relaxed">
              Not just another dashboard with a shipping label printer. Every feature is designed to reduce cost and increase speed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.25 } }}
              className={`group relative rounded-2xl border border-[#0f172a]/[0.06] bg-white hover:border-[#0f172a]/[0.1] hover:shadow-lg hover:shadow-[#0f172a]/[0.03] transition-all duration-500 overflow-hidden ${
                feature.size === 'large' ? 'lg:col-span-2 p-8' : 'p-6'
              }`}
            >
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0f172a]/40 border border-[#0f172a]/[0.1] px-2.5 py-1 rounded-full">
                  {feature.tag}
                </span>
                <ArrowUpRight className="h-4 w-4 text-[#0f172a]/0 group-hover:text-[#0f172a]/30 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>

              <div className="mb-5">
                <feature.icon className="h-6 w-6 text-[#0f172a]/40 group-hover:text-[#3b82f6] transition-colors duration-500" />
              </div>

              <h3 className="text-lg font-semibold text-[#0f172a]/80 mb-2 tracking-[-0.01em]">{feature.title}</h3>
              <p className="text-[13px] text-[#0f172a]/55 leading-relaxed group-hover:text-[#0f172a]/70 transition-colors duration-500">
                {feature.description}
              </p>

              <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[#3b82f6]/[0.04] rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
