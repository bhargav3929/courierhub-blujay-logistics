'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const col1 = [
  { name: 'Rajesh Sharma', company: 'StyleKart Fashion', text: 'Blujay cut our shipping costs by 35% while improving delivery speeds. The rate comparison feature alone pays for itself.' },
  { name: 'Sneha Reddy', company: 'HomeDecor Studio', text: 'From COD reconciliation to reverse logistics, everything just works. We finally have visibility into our shipping costs.' },
];

const col2 = [
  { name: 'Priya Patel', company: 'FreshBox Organics', text: 'We manage 3,000+ daily shipments from one dashboard now. The multi-carrier integration saved us from juggling five different courier portals.' },
  { name: 'Vikram Joshi', company: 'GadgetWorld', text: 'Scaled from 100 to 5,000 daily shipments. Their auto-allocation AI picks the best courier every single time. Game changer for our ops team.' },
];

const col3 = [
  { name: 'Amit Verma', company: 'TechGear India', text: 'Real-time tracking and automated notifications reduced our support tickets by 60%. Customers are happier, team is happier.' },
  { name: 'Meera Nair', company: 'PureAyurved', text: 'The wallet system makes payments seamless. No more chasing invoices from multiple couriers. Everything is in one place.' },
];

function TestimonialCard({ name, company, text }: { name: string; company: string; text: string }) {
  return (
    <div className="p-6 rounded-2xl border border-[#0f172a]/[0.06] bg-white hover:border-[#0f172a]/[0.1] hover:shadow-lg hover:shadow-[#0f172a]/[0.03] transition-all duration-500">
      <div className="flex gap-0.5 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" />
        ))}
      </div>
      <p className="text-[13px] text-[#0f172a]/60 leading-relaxed mb-6">&ldquo;{text}&rdquo;</p>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#0f172a]/[0.06] border border-[#0f172a]/[0.08] flex items-center justify-center text-[10px] font-bold text-[#0f172a]/50">
          {name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div className="text-[12px] text-[#0f172a]/80 font-medium">{name}</div>
          <div className="text-[11px] text-[#0f172a]/45">{company}</div>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-28 lg:py-36 bg-[#f8fafc] relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mb-16">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-[#3b82f6]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Testimonials</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em]">
              Don&apos;t take our
              <br />word for it.
            </h2>
          </div>
          <div className="lg:col-span-4 lg:col-start-8 flex items-end">
            <p className="text-[15px] text-[#0f172a]/55 leading-relaxed">
              From solo D2C brands to enterprise operations — hear from businesses that ship with Blujay.
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div className="space-y-4">{col1.map(t => <TestimonialCard key={t.name} {...t} />)}</div>
          <div className="space-y-4 md:mt-8">{col2.map(t => <TestimonialCard key={t.name} {...t} />)}</div>
          <div className="space-y-4 md:mt-4">{col3.map(t => <TestimonialCard key={t.name} {...t} />)}</div>
        </motion.div>
      </div>
    </section>
  );
}
