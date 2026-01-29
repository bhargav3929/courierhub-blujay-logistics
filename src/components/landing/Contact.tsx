'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Thank you! We\'ll get back to you soon.');
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <section id="contact" className="py-28 lg:py-36 bg-white relative">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-8 bg-[#3b82f6]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Contact</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#0f172a] leading-[1.1] tracking-[-0.03em] mb-8">
              Let&apos;s talk
              <br />shipping.
            </h2>

            <div className="space-y-8">
              <div>
                <div className="text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Email</div>
                <a href="mailto:support@blujaylogistics.in" className="text-[15px] text-[#0f172a]/65 hover:text-[#0f172a] transition-colors">
                  support@blujaylogistics.in
                </a>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Phone</div>
                <p className="text-[15px] text-[#0f172a]/65">+91 80 4567 8900</p>
                <p className="text-[11px] text-[#0f172a]/40 mt-1">Mon-Sat, 9AM - 7PM IST</p>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Office</div>
                <p className="text-[15px] text-[#0f172a]/65">Koramangala, Bangalore</p>
                <p className="text-[11px] text-[#0f172a]/40 mt-1">Karnataka, India 560034</p>
              </div>

              <div className="flex gap-4 pt-2">
                {['Twitter', 'LinkedIn', 'Instagram'].map((s) => (
                  <a key={s} href="#" className="text-[12px] text-[#0f172a]/40 hover:text-[#0f172a]/70 transition-colors">
                    {s}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 lg:col-start-7">
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Name</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-0 py-3 bg-transparent border-b border-[#0f172a]/[0.08] text-[#0f172a] text-[14px] placeholder-[#0f172a]/30 focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Email</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-0 py-3 bg-transparent border-b border-[#0f172a]/[0.08] text-[#0f172a] text-[14px] placeholder-[#0f172a]/30 focus:outline-none focus:border-[#3b82f6]/50 transition-colors"
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.15em] text-[#0f172a]/40 mb-2">Message</label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full px-0 py-3 bg-transparent border-b border-[#0f172a]/[0.08] text-[#0f172a] text-[14px] placeholder-[#0f172a]/30 focus:outline-none focus:border-[#3b82f6]/50 transition-colors resize-none"
                  placeholder="Tell us about your shipping volume and needs..."
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="group inline-flex items-center gap-2 px-6 py-3 text-[13px] font-medium text-[#0f172a] bg-[#0f172a]/[0.04] border border-[#0f172a]/[0.08] rounded-xl hover:bg-[#0f172a]/[0.08] transition-all"
                >
                  Send message
                  <ArrowUpRight className="h-3.5 w-3.5 text-[#0f172a]/30 group-hover:text-[#0f172a]/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </button>
              </div>
            </motion.form>
          </div>
        </div>
      </div>
    </section>
  );
}
