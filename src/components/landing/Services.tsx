'use client';

import { motion } from 'framer-motion';
import { Zap, Truck, Banknote, RotateCcw, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Service {
  icon: LucideIcon;
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
}

const services: Service[] = [
  { icon: Zap, title: 'Express Delivery', description: 'Same-day and next-day delivery across major metros with guaranteed SLA timelines.', metric: '< 24h', metricLabel: 'metro delivery' },
  { icon: Truck, title: 'Standard Shipping', description: 'Reliable ground shipping with coverage across 28,000+ pin codes. The workhorse of Indian e-commerce.', metric: '28K+', metricLabel: 'pin codes' },
  { icon: Banknote, title: 'COD Services', description: 'Cash on delivery with quick remittance cycles, real-time reconciliation, and fraud protection.', metric: '48h', metricLabel: 'COD remittance' },
  { icon: RotateCcw, title: 'Reverse Logistics', description: 'Automated return pickups, quality checks, and inventory reconciliation. Reduce RTO impact.', metric: '60%', metricLabel: 'less RTO cost' },
  { icon: MapPin, title: 'Hyperlocal', description: 'Intra-city delivery within 2-4 hours for quick commerce and local fulfillment.', metric: '2-4h', metricLabel: 'delivery time' },
];

export default function Services() {
  return (
    <section id="services" className="py-28 lg:py-36 bg-white relative">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-8 bg-[#3b82f6]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Services</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em]">
              Every mile, covered.
            </h2>
            <p className="text-[15px] text-[#0f172a]/55 leading-relaxed lg:max-w-md lg:ml-auto">
              From a 2-hour hyperlocal delivery to a 7-day economy shipment across the country — pick the service that fits.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#0f172a]/[0.06]">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 py-8 items-center hover:bg-[#0f172a]/[0.01] -mx-6 px-6 transition-colors duration-500 rounded-xl cursor-default"
            >
              <div className="md:col-span-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#0f172a]/[0.03] border border-[#0f172a]/[0.06] flex items-center justify-center group-hover:border-[#3b82f6]/20 group-hover:bg-[#3b82f6]/[0.06] transition-all duration-500">
                  <service.icon className="h-4 w-4 text-[#0f172a]/40 group-hover:text-[#3b82f6] transition-colors duration-500" />
                </div>
                <h3 className="text-base font-semibold text-[#0f172a]/80 group-hover:text-[#0f172a] transition-colors duration-300">{service.title}</h3>
              </div>

              <div className="md:col-span-5">
                <p className="text-[13px] text-[#0f172a]/50 leading-relaxed group-hover:text-[#0f172a]/65 transition-colors duration-500">{service.description}</p>
              </div>

              <div className="md:col-span-3 md:text-right">
                <div className="text-2xl font-bold text-[#0f172a]/20 group-hover:text-[#3b82f6]/60 transition-colors duration-500 tracking-tight">{service.metric}</div>
                <div className="text-[10px] text-[#0f172a]/35 uppercase tracking-wider">{service.metricLabel}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
