'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Package, BarChart3, MapPin, Truck, IndianRupee } from 'lucide-react';

export default function Hero() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section id="hero" ref={containerRef} className="relative min-h-screen overflow-hidden bg-[#fafbfc]">
      {/* Subtle grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:72px_72px]" />

      {/* Ambient glow */}
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-[#3b82f6]/[0.06] rounded-full blur-[150px]" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#06b6d4]/[0.04] rounded-full blur-[130px]" />

      <motion.div style={{ y, opacity }} className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-32 lg:pt-44 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-8 items-start">
          {/* Left — Editorial text */}
          <div className="lg:col-span-5">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
              <div className="flex items-center gap-3 mb-8">
                <div className="h-px w-12 bg-[#3b82f6]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">Courier Aggregator Platform</span>
              </div>

              <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold text-[#0f172a] leading-[1.05] tracking-[-0.035em]">
                The last
                <br />
                shipping platform
                <br />
                <span className="relative inline-block">
                  you&apos;ll ever need
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                    <path d="M2 8C50 2 120 2 298 8" stroke="url(#hero-underline)" strokeWidth="3" strokeLinecap="round" />
                    <defs>
                      <linearGradient id="hero-underline" x1="0" y1="0" x2="300" y2="0">
                        <stop stopColor="#3b82f6" />
                        <stop offset="1" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              <p className="mt-8 text-base lg:text-lg text-[#0f172a]/55 leading-relaxed max-w-md">
                Compare rates across 15+ courier partners. Book, track, and manage every shipment from one dashboard. Built for Indian e-commerce.
              </p>

              <div className="mt-10 flex items-center gap-4 flex-wrap">
                <Link
                  href="/get-started"
                  className="group relative inline-flex items-center gap-2 px-7 py-3.5 text-[14px] font-semibold text-white rounded-full overflow-hidden"
                >
                  <div className="absolute inset-0 bg-[#0f172a]" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span className="relative">Start Shipping</span>
                  <ArrowRight className="relative h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-medium text-[#0f172a]/40 hover:text-[#0f172a]/70 transition-colors">
                  <div className="w-8 h-8 rounded-full border border-[#0f172a]/15 flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[6px] border-l-[#0f172a]/50 border-y-[4px] border-y-transparent ml-0.5" />
                  </div>
                  Watch demo
                </button>
              </div>

              {/* Social proof */}
              <div className="mt-14 flex items-center gap-4">
                <div className="flex -space-x-2">
                  {['RS', 'PP', 'AV', 'MN'].map((initials, i) => (
                    <div key={initials} className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e2e8f0] to-[#f1f5f9] border-2 border-[#fafbfc] flex items-center justify-center text-[9px] font-bold text-[#0f172a]/40" style={{ zIndex: 4 - i }}>
                      {initials}
                    </div>
                  ))}
                </div>
                <span className="text-[13px] text-[#0f172a]/50"><span className="text-[#0f172a]/70 font-medium">50,000+</span> businesses ship with us</span>
              </div>
            </motion.div>
          </div>

          {/* Right — Dashboard mockup (keep dark for contrast) */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-br from-[#3b82f6]/10 to-[#06b6d4]/5 rounded-3xl blur-2xl" />

              <div className="relative rounded-2xl border border-[#0f172a]/[0.08] bg-[#0f172a] overflow-hidden shadow-2xl shadow-[#0f172a]/20">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/70" />
                  </div>
                  <div className="flex-1 mx-12">
                    <div className="mx-auto max-w-[200px] h-5 rounded-md bg-white/[0.06] flex items-center justify-center">
                      <span className="text-[10px] text-white/30">app.blujaylogistics.in</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Shipments Today', value: '1,247', icon: Package, change: '+12%', color: '#3b82f6' },
                      { label: 'In Transit', value: '3,892', icon: Truck, change: '+5%', color: '#f97316' },
                      { label: 'Revenue', value: '₹4.2L', icon: IndianRupee, change: '+18%', color: '#22c55e' },
                    ].map((m) => (
                      <div key={m.label} className="p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-2.5">
                          <m.icon className="h-4 w-4" style={{ color: m.color }} />
                          <span className="text-[10px] font-medium text-[#22c55e]">{m.change}</span>
                        </div>
                        <div className="text-lg font-bold text-white/90 tracking-tight">{m.value}</div>
                        <div className="text-[10px] text-white/30 mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-4">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-medium text-white/40">Shipment Volume</span>
                      <div className="flex gap-2">
                        {['7D', '30D', '90D'].map((p, i) => (
                          <span key={p} className={`text-[9px] px-2 py-0.5 rounded-md ${i === 1 ? 'bg-[#3b82f6]/20 text-[#60a5fa]' : 'text-white/20'}`}>{p}</span>
                        ))}
                      </div>
                    </div>
                    <svg viewBox="0 0 400 100" className="w-full h-auto" fill="none">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#3b82f6" stopOpacity="0.2" />
                          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0 80 C30 75, 60 60, 100 55 C140 50, 160 65, 200 40 C240 15, 260 30, 300 20 C340 10, 370 25, 400 15" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                      <path d="M0 80 C30 75, 60 60, 100 55 C140 50, 160 65, 200 40 C240 15, 260 30, 300 20 C340 10, 370 25, 400 15 L400 100 L0 100Z" fill="url(#chartGrad)" />
                    </svg>
                  </div>

                  <div className="space-y-2">
                    {[
                      { awb: 'BD29384756', dest: 'Mumbai → Delhi', status: 'In Transit', sc: '#f97316' },
                      { awb: 'DL87293847', dest: 'Bangalore → Pune', status: 'Delivered', sc: '#22c55e' },
                      { awb: 'XB64738291', dest: 'Chennai → Hyderabad', status: 'Picked Up', sc: '#3b82f6' },
                    ].map((s) => (
                      <div key={s.awb} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                        <MapPin className="h-3.5 w-3.5 text-white/20 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-white/60 font-mono">{s.awb}</div>
                          <div className="text-[10px] text-white/25">{s.dest}</div>
                        </div>
                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full" style={{ color: s.sc, backgroundColor: `${s.sc}15` }}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating rate card */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="absolute -right-4 top-16 lg:-right-8 z-20 hidden sm:block"
              >
                <div className="p-4 rounded-xl bg-white border border-[#0f172a]/[0.08] shadow-xl shadow-[#0f172a]/10 w-[180px]">
                  <div className="text-[10px] text-[#0f172a]/30 mb-2">Best Rate Found</div>
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="h-4 w-4 text-[#22c55e]" />
                    <span className="text-xl font-bold text-[#0f172a]">₹42</span>
                    <span className="text-[10px] text-[#22c55e] font-medium">-35%</span>
                  </div>
                  <div className="text-[9px] text-[#0f172a]/25 leading-relaxed">Delhivery Surface • 500g<br />Mumbai → Delhi • 3-5 days</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
