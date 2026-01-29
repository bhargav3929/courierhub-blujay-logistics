'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function CTA() {
  return (
    <section className="py-28 lg:py-36 bg-[#f8fafc] relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#3b82f6]/[0.05] rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative max-w-[800px] mx-auto px-6 lg:px-10 text-center"
      >
        <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em] mb-6">
          Ready to ship
          <br />
          <span className="text-[#0f172a]/35">smarter?</span>
        </h2>
        <p className="text-[15px] text-[#0f172a]/55 max-w-md mx-auto mb-10 leading-relaxed">
          Join 50,000+ Indian businesses. Free to start, no credit card required.
        </p>
        <Link
          href="/client-signup"
          className="group inline-flex items-center gap-2 px-8 py-4 text-[14px] font-semibold text-white bg-[#0f172a] rounded-full hover:bg-[#1e293b] transition-colors shadow-lg shadow-[#0f172a]/10"
        >
          Get Started Free
          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </motion.div>
    </section>
  );
}
