'use client';

import { motion } from 'framer-motion';
import { UserPlus, Link2, Scale, Truck } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    num: '01',
    title: 'Create account',
    description: 'Sign up in under 2 minutes. No credit card, no lengthy KYC. Just your email and you\'re in.',
  },
  {
    icon: Link2,
    num: '02',
    title: 'Connect your store',
    description: 'One-click integration with Shopify, WooCommerce, or any custom platform via our API.',
  },
  {
    icon: Scale,
    num: '03',
    title: 'Compare & book',
    description: 'See rates from every courier partner side by side. Pick the best option, or let our AI choose.',
  },
  {
    icon: Truck,
    num: '04',
    title: 'Ship & track',
    description: 'Generate labels, schedule pickups, and track every shipment in real-time. That\'s it.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-28 lg:py-36 bg-white relative overflow-hidden">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#3b82f6]/[0.04] rounded-full blur-[120px]" />

      <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-4 lg:sticky lg:top-32 lg:self-start">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-[#3b82f6]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Process</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em] mb-5">
              From signup
              <br />to first shipment
              <br />in 10 minutes.
            </h2>
            <p className="text-[15px] text-[#0f172a]/50 leading-relaxed">
              No onboarding calls. No setup fees. No waiting for account activation. Just start shipping.
            </p>
          </div>

          <div className="lg:col-span-7 lg:col-start-6">
            <div className="space-y-1">
              {steps.map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative flex gap-6 p-6 rounded-2xl hover:bg-[#0f172a]/[0.02] transition-colors duration-500 border border-transparent hover:border-[#0f172a]/[0.04]"
                >
                  <div className="flex-shrink-0 w-14 pt-1">
                    <span className="text-[32px] font-bold text-[#0f172a]/[0.06] group-hover:text-[#3b82f6]/25 transition-colors duration-500 tracking-tighter font-mono">
                      {step.num}
                    </span>
                  </div>

                  <div className="flex-1 pt-2">
                    <div className="flex items-center gap-3 mb-2">
                      <step.icon className="h-4 w-4 text-[#0f172a]/40 group-hover:text-[#3b82f6] transition-colors duration-500" />
                      <h3 className="text-base font-semibold text-[#0f172a]/80 group-hover:text-[#0f172a] transition-colors duration-300">{step.title}</h3>
                    </div>
                    <p className="text-[13px] text-[#0f172a]/50 leading-relaxed group-hover:text-[#0f172a]/65 transition-colors duration-500 max-w-sm">
                      {step.description}
                    </p>
                  </div>

                  {i < steps.length - 1 && (
                    <div className="absolute left-[3.25rem] bottom-0 w-px h-1 bg-[#0f172a]/[0.04]" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
