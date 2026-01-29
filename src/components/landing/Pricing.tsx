'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, ArrowUpRight } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For small sellers getting started.',
    features: ['100 shipments/month', '3 courier partners', 'Basic rate comparison', 'Email support', 'Standard tracking', 'COD services'],
    cta: 'Get Started',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '₹999',
    period: '/mo',
    description: 'For scaling businesses.',
    features: ['5,000 shipments/month', 'All 15+ couriers', 'Advanced rate engine', 'Priority support', 'Real-time notifications', 'Analytics dashboard', 'Wallet system', 'API access'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For high-volume operations.',
    features: ['Unlimited shipments', 'Custom courier rates', 'AI auto-allocation', 'Dedicated account manager', 'Custom integrations', 'SLA guarantees', 'White-label option', 'Advanced reporting'],
    cta: 'Contact Sales',
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section className="py-28 lg:py-36 bg-white relative">
      <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-px w-8 bg-[#3b82f6]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Pricing</span>
            <div className="h-px w-8 bg-[#3b82f6]" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em] mb-4">
            Simple, honest pricing.
          </h2>
          <p className="text-[15px] text-[#0f172a]/30 max-w-md mx-auto">
            No hidden fees. No per-shipment markup. Pay for the plan, ship at actual courier rates.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`relative rounded-2xl border p-7 transition-all duration-500 ${
                plan.highlight
                  ? 'border-[#3b82f6]/30 bg-[#3b82f6]/[0.03] shadow-lg shadow-[#3b82f6]/[0.06]'
                  : 'border-[#0f172a]/[0.06] bg-white hover:border-[#0f172a]/[0.1] hover:shadow-md hover:shadow-[#0f172a]/[0.03]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-7 px-3 py-1 rounded-full bg-[#3b82f6] text-white text-[10px] font-semibold tracking-wide">
                  POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-sm font-medium text-[#0f172a]/50 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#0f172a] tracking-tight">{plan.price}</span>
                  {plan.period && <span className="text-[13px] text-[#0f172a]/25">{plan.period}</span>}
                </div>
                <p className="text-[12px] text-[#0f172a]/25 mt-2">{plan.description}</p>
              </div>

              <div className="h-px bg-[#0f172a]/[0.06] mb-6" />

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="h-3.5 w-3.5 text-[#3b82f6]/60 flex-shrink-0 mt-0.5" />
                    <span className="text-[12px] text-[#0f172a]/35">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/client-signup"
                className={`group flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[13px] font-medium transition-all duration-300 ${
                  plan.highlight
                    ? 'bg-[#0f172a] text-white hover:bg-[#1e293b]'
                    : 'bg-[#0f172a]/[0.04] text-[#0f172a]/50 border border-[#0f172a]/[0.08] hover:bg-[#0f172a]/[0.08] hover:text-[#0f172a]/70'
                }`}
              >
                {plan.cta}
                <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
