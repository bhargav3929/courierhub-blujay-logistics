'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence, useMotionValueEvent, useScroll } from 'framer-motion';
import { Menu, X, ArrowUpRight } from 'lucide-react';

interface NavbarProps {
  scrollTo: (target: string, offset?: number) => void;
}

export default function Navbar({ scrollTo }: NavbarProps) {
  const [hidden, setHidden] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const prev = scrollY.getPrevious() ?? 0;
    setHidden(latest > prev && latest > 300);
    setIsScrolled(latest > 50);
  });

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['contact', 'testimonials', 'services', 'about', 'hero'];
      let found = '';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 300) {
          found = id;
          break;
        }
      }
      setActiveSection(found);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', target: '#hero', id: 'hero' },
    { label: 'About', target: '#about', id: 'about' },
    { label: 'Services', target: '#services', id: 'services' },
    { label: 'Testimonials', target: '#testimonials', id: 'testimonials' },
    { label: 'Contact', target: '#contact', id: 'contact' },
  ];

  return (
    <>
      <motion.header
        animate={{ y: hidden ? '-100%' : '0%' }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-500 ${
          isScrolled
            ? 'bg-white/80 backdrop-blur-2xl border-b border-[#0f172a]/[0.06] shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-[72px]">
            <Link href="/" className="relative -ml-6">
              <Image
                src="/logos/blujay-logo.svg"
                alt="Blujay Logistics"
                width={200}
                height={43}
                unoptimized
                priority
              />
            </Link>

            <nav className="hidden md:flex items-center gap-1 px-1.5 py-1.5 rounded-full bg-[#0f172a]/[0.04] border border-[#0f172a]/[0.06]">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.target)}
                  className={`relative px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-300 ${
                    activeSection === link.id ? 'text-[#0f172a]' : 'text-[#0f172a]/40 hover:text-[#0f172a]/70'
                  }`}
                >
                  {activeSection === link.id && (
                    <motion.div
                      layoutId="navPill"
                      className="absolute inset-0 bg-white rounded-full shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
                </button>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-2">
              <Link href="/client-login" className="px-4 py-2 text-[13px] font-medium text-[#0f172a]/50 hover:text-[#0f172a] transition-colors">
                Log in
              </Link>
              <Link href="/client-signup" className="group relative px-5 py-2 text-[13px] font-medium text-white overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-[#0f172a] rounded-full" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="relative flex items-center gap-1.5">
                  Get Started
                  <ArrowUpRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </span>
              </Link>
            </div>

            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-[#0f172a]/60 hover:text-[#0f172a]">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-white/98 backdrop-blur-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 h-[72px]">
              <Link href="/">
                <Image
                  src="/logos/blujay-logo.svg"
                  alt="Blujay Logistics"
                  width={200}
                  height={43}
                  unoptimized
                />
              </Link>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-[#0f172a]/60"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 flex flex-col justify-center px-10 gap-8">
              {navLinks.map((link, i) => (
                <motion.button
                  key={link.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => { scrollTo(link.target); setMobileOpen(false); }}
                  className="text-left text-4xl font-light text-[#0f172a]/70 hover:text-[#0f172a] transition-colors tracking-tight"
                >
                  {link.label}
                </motion.button>
              ))}
            </div>
            <div className="px-6 pb-10 flex flex-col gap-3">
              <Link href="/client-login" className="text-center py-3 text-[#0f172a]/50 text-sm border border-[#0f172a]/10 rounded-xl">Log in</Link>
              <Link href="/client-signup" className="text-center py-3 text-white text-sm bg-[#0f172a] rounded-xl">Get Started</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
